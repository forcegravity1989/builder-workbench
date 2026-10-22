import { net } from 'electron'
import { MAIN_RELEASE_REPO, normalizeTagToVersion } from '../shared/release-channel'
import { compareVersions, isPrereleaseVersion, isValidVersion } from './updater-fallback'
import {
  ESCAPED_RELEASE_REPO,
  FETCH_TIMEOUT_MS,
  getManifestVersion,
  getPlatformManifestReadiness,
  getReleaseDownloadUrl,
  getReleaseManifestUrl,
  getReleaseTagPageUrl,
  parseReleaseManifest
} from './updater-release-manifest'

const ATOM_FEED_URL = `https://github.com/${MAIN_RELEASE_REPO}/releases.atom`
const RELEASES_LATEST_API_URL = `https://api.github.com/repos/${MAIN_RELEASE_REPO}/releases/latest`
const MAX_MANIFEST_PROBE_CANDIDATES = 6

// Why: GitHub's atom feed lists every release (prerelease or stable) in a
// single flat list. Each entry has a /releases/tag/<tag> URL we can mine
// without any channel filtering.
const TAG_HREF_RE = new RegExp(
  `href="https://github\\.com/${ESCAPED_RELEASE_REPO}/releases/tag/([^"]+)"`,
  'g'
)

type ReleaseFeedTag = {
  tag: string
  version: string
}

export function isPerfPrereleaseTag(tag: string): boolean {
  const version = normalizeTagToVersion(tag)
  const match = version.match(/^\d+\.\d+\.\d+-([0-9A-Za-z-.]+)(?:\+[0-9A-Za-z-.]+)?$/)
  const identifiers = match?.[1]?.split('.') ?? []
  return (
    identifiers.length === 3 &&
    identifiers[0] === 'rc' &&
    /^\d+$/.test(identifiers[1]) &&
    identifiers[2] === 'perf'
  )
}

async function fetchReleaseFeedTags(): Promise<ReleaseFeedTag[] | null> {
  try {
    const res = await net.fetch(ATOM_FEED_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) {
      return null
    }
    const body = await res.text()
    const tags: ReleaseFeedTag[] = []

    for (const match of body.matchAll(TAG_HREF_RE)) {
      const tag = match[1]
      const version = normalizeTagToVersion(tag)
      if (isValidVersion(version)) {
        tags.push({ tag, version })
      }
    }

    tags.sort((left, right) => compareVersions(right.version, left.version))
    return tags
  } catch {
    return null
  }
}

/**
 * Walks the GitHub releases atom feed and returns the tag of the newest
 * release strictly greater than `currentVersion`.
 *
 * Why: electron-updater's GitHubProvider filters the feed by channel, and
 * GitHub's /latest/download redirect can move between check and download.
 * By resolving the newest tag ourselves and pinning the generic provider at
 * `/releases/download/<tag>`, the manifest and downloaded asset stay tied to
 * the same release.
 *
 * Returns null if the fetch fails, the feed has no parseable tags, or
 * nothing in the feed is newer than `currentVersion`.
 */
type FetchNewerReleaseTagOptions = {
  includePrerelease?: boolean
  releaseFilter?: 'perf'
}

export type FetchNewerReleaseTagsResult =
  | { tags: string[]; state: 'ready' }
  | { tags: string[]; state: 'no-newer' }
  | { tags: string[]; state: 'not-ready'; lastGoodTag?: string }
  | { tags: string[]; state: 'unavailable'; unavailableReason: 'feed' | 'manifest' }

export async function fetchNewerReleaseTag(
  currentVersion: string,
  options: FetchNewerReleaseTagOptions = {}
): Promise<string | null> {
  return (await fetchNewerReleaseTags(currentVersion, 1, options))[0] ?? null
}

export async function fetchNewerReleaseTags(
  currentVersion: string,
  maxTags: number,
  options: FetchNewerReleaseTagOptions = {}
): Promise<string[]> {
  return (await fetchNewerReleaseTagsWithReadiness(currentVersion, maxTags, options)).tags
}

export async function fetchNewerReleaseTagsWithReadiness(
  currentVersion: string,
  maxTags: number,
  options: FetchNewerReleaseTagOptions = {}
): Promise<FetchNewerReleaseTagsResult> {
  const includePrerelease = options.includePrerelease ?? true
  if (maxTags <= 0) {
    return { tags: [], state: 'no-newer' }
  }
  const tags = await fetchReleaseFeedTags()
  if (!tags) {
    return { tags: [], state: 'unavailable', unavailableReason: 'feed' }
  }

  // Why: perf builds are explicit opt-in; regular prerelease checks should
  // stay on the main RC/stable series even though perf tags are semver-newer.
  const candidates =
    options.releaseFilter === 'perf'
      ? tags.filter(({ tag }) => isPerfPrereleaseTag(tag))
      : includePrerelease
        ? tags.filter(({ tag }) => !isPerfPrereleaseTag(tag))
        : tags.filter(({ version }) => !isPrereleaseVersion(version))
  const newestNewerIndex = candidates.findIndex(
    ({ version }) => compareVersions(version, currentVersion) > 0
  )
  if (newestNewerIndex === -1) {
    return { tags: [], state: 'no-newer' }
  }

  // Why: a cancelled release can leave several feed entries without manifests,
  // but update checks must not stall on an unbounded run of 5s probes.
  const probeCandidates = candidates.slice(
    newestNewerIndex,
    newestNewerIndex + MAX_MANIFEST_PROBE_CANDIDATES
  )
  const probeResults = await Promise.all(
    probeCandidates.map(async ({ tag, version }) => ({
      tag,
      version,
      readiness: await getPlatformManifestReadiness(tag)
    }))
  )
  // Why drop mismatches entirely instead of ranking them not-ready: a dirty
  // ledger never settles, so it must not hold the scan in a retry loop or
  // block a clean older tag from being offered as the primary.
  const manifestResults = probeResults.filter(({ readiness }) => readiness !== 'ledger-mismatch')
  if (manifestResults.length === 0) {
    // Every newer candidate in the probe window is ledger-dirty; the feed has
    // nothing offerable, which the caller resolves like "nothing newer".
    return { tags: [], state: 'no-newer' }
  }

  const primaryIndex = manifestResults.findIndex(
    ({ readiness, version }) =>
      readiness === 'ready' && compareVersions(version, currentVersion) > 0
  )
  if (primaryIndex === -1) {
    if (manifestResults[0]?.readiness === 'unavailable') {
      return { tags: [], state: 'unavailable', unavailableReason: 'manifest' }
    }
    const lastGoodTag = manifestResults.find(({ readiness }) => readiness === 'ready')?.tag
    return lastGoodTag
      ? { tags: [], state: 'not-ready', lastGoodTag }
      : { tags: [], state: 'not-ready' }
  }

  if (primaryIndex > 0) {
    if (manifestResults[0]?.readiness === 'unavailable') {
      return { tags: [], state: 'unavailable', unavailableReason: 'manifest' }
    }
    return { tags: [], state: 'not-ready', lastGoodTag: manifestResults[primaryIndex].tag }
  }

  return {
    tags: manifestResults
      .slice(primaryIndex)
      .filter(({ readiness }) => readiness === 'ready')
      .slice(0, maxTags)
      .map(({ tag }) => tag),
    state: 'ready'
  }
}

export type VerifiedLatestStableRelease =
  | { state: 'ready'; tag: string; feedUrl: string; releaseUrl: string }
  | {
      state: 'not-available'
      reason: 'ledger-mismatch' | 'not-newer'
      tag: string
      manifestVersion: string
    }

/**
 * Resolves what GitHub's releases/latest redirect would actually serve and
 * ledger-verifies it before any feed is pinned at it.
 *
 * Why: the atom-feed scan resolves tags, but a release whose manifest version
 * contradicts its tag (v0.6.0 shipped latest.yml claiming 1.4.197-local.*)
 * turns the unverified redirect into a phantom update — electron-updater
 * offers the manifest's version, which semver-ranks above every real product
 * version and derives release notes to a tag page that 404s.
 *
 * Returns null when the release or its manifest cannot be fetched or parsed,
 * so callers keep their existing fail-open behavior on network degradation.
 */
export async function resolveVerifiedLatestStableRelease(
  currentVersion: string
): Promise<VerifiedLatestStableRelease | null> {
  let tag: string
  let htmlUrl: string | null
  try {
    const res = await net.fetch(RELEASES_LATEST_API_URL, {
      headers: { accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    })
    if (!res.ok) {
      return null
    }
    const entry = (await res.json()) as { tag_name?: unknown; html_url?: unknown } | null
    const tagName = entry?.tag_name
    if (typeof tagName !== 'string' || !isValidVersion(normalizeTagToVersion(tagName))) {
      return null
    }
    tag = tagName
    htmlUrl = typeof entry?.html_url === 'string' ? entry.html_url : null
  } catch {
    return null
  }

  let manifestVersion: string | null = null
  try {
    const res = await net.fetch(getReleaseManifestUrl(tag), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    })
    if (res.ok) {
      manifestVersion = getManifestVersion(parseReleaseManifest(await res.text()))
    }
  } catch {
    // Leave null; an unverifiable manifest falls through to the caller's fail-open path.
  }
  if (manifestVersion === null) {
    return null
  }
  if (manifestVersion !== normalizeTagToVersion(tag)) {
    console.info(
      `[updater] latest release ${tag} rejected: manifest version ${manifestVersion} does not match its tag (ledger mismatch)`
    )
    return { state: 'not-available', reason: 'ledger-mismatch', tag, manifestVersion }
  }
  if (compareVersions(manifestVersion, currentVersion) <= 0) {
    return { state: 'not-available', reason: 'not-newer', tag, manifestVersion }
  }
  return {
    state: 'ready',
    tag,
    feedUrl: getReleaseDownloadUrl(tag),
    releaseUrl: htmlUrl ?? getReleaseTagPageUrl(tag)
  }
}
