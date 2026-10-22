import { net } from 'electron'
import { parse } from 'yaml'
import { MAIN_RELEASE_REPO, normalizeTagToVersion } from '../shared/release-channel'

// Why a separate module: release URL building, manifest parsing and the
// readiness probes are the lower layer both the atom-feed scan and the
// verified-latest resolver build on; keeping them here holds every file in
// the update-feed path inside the size budget.
export const FETCH_TIMEOUT_MS = 5000

const RELEASES_DOWNLOAD_BASE = `https://github.com/${MAIN_RELEASE_REPO}/releases/download`
export const ESCAPED_RELEASE_REPO = MAIN_RELEASE_REPO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Absolute asset URLs in a manifest point back at the same repo's download route.
const GITHUB_RELEASE_DOWNLOAD_RE = new RegExp(
  `^https://github\\.com/${ESCAPED_RELEASE_REPO}/releases/download/`,
  'i'
)

export function getReleaseDownloadUrl(tag: string): string {
  return `${RELEASES_DOWNLOAD_BASE}/${encodeURIComponent(tag)}`
}

export function getReleaseTagPageUrl(tag: string): string {
  return `https://github.com/${MAIN_RELEASE_REPO}/releases/tag/${encodeURIComponent(tag)}`
}

function getPlatformManifestName(): string {
  if (process.platform === 'darwin') {
    return 'latest-mac.yml'
  }
  if (process.platform === 'linux') {
    return 'latest-linux.yml'
  }
  return 'latest.yml'
}

export function getReleaseManifestUrl(tag: string): string {
  return `${getReleaseDownloadUrl(tag)}/${getPlatformManifestName()}`
}

function getReleaseAssetUrl(tag: string, assetName: string): string {
  return `${getReleaseDownloadUrl(tag)}/${encodeURIComponent(assetName)}`
}

type ManifestAssetEntry = {
  url?: unknown
  path?: unknown
}

export type ParsedManifest = {
  version?: unknown
  files?: ManifestAssetEntry[]
  path?: unknown
} | null

export function parseReleaseManifest(text: string): ParsedManifest {
  return parse(text) as ParsedManifest
}

function getManifestAssetNames(parsed: ParsedManifest): string[] {
  const names = new Set<string>()
  for (const file of Array.isArray(parsed?.files) ? parsed.files : []) {
    const value = typeof file.url === 'string' ? file.url : file.path
    if (typeof value === 'string' && value.trim()) {
      names.add(value.trim())
    }
  }
  if (typeof parsed?.path === 'string' && parsed.path.trim()) {
    names.add(parsed.path.trim())
  }
  return [...names]
}

export function getManifestVersion(parsed: ParsedManifest): string | null {
  return typeof parsed?.version === 'string' && parsed.version.trim() ? parsed.version.trim() : null
}

// Why a distinct value instead of folding into 'not-ready': a release whose
// manifest version contradicts its own tag is a permanently broken ledger
// entry (v0.6.0 shipped latest.yml claiming 1.4.197-local.*), not a publish
// window that settles on retry. Offering it makes electron-updater report a
// version no tag backs — release notes derived from it 404, and semver-newer
// stamps (1.4.x from the Orca baseline) outrank every real BW 0.x version.
export type ReleaseReadiness = 'ready' | 'not-ready' | 'ledger-mismatch' | 'unavailable'

function getGitHubReleaseAssetReadiness(assetUrl: string): Promise<ReleaseReadiness> {
  return new Promise((resolve) => {
    const request = net.request({ method: 'HEAD', url: assetUrl, redirect: 'manual' })
    let settled = false
    const settle = (readiness: ReleaseReadiness): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      resolve(readiness)
    }
    const timeout = setTimeout(() => {
      try {
        request.abort()
      } catch {
        // The request may already have been cancelled by Electron.
      }
      settle('unavailable')
    }, FETCH_TIMEOUT_MS)

    request.on('redirect', (statusCode) => {
      // Why: GitHub's 302 proves the asset exists without probing its signed storage URL.
      settle(statusCode >= 300 && statusCode < 400 ? 'ready' : 'unavailable')
    })
    request.on('response', (response) => {
      settle(
        response.statusCode === 404
          ? 'not-ready'
          : response.statusCode >= 200 && response.statusCode < 300
            ? 'ready'
            : 'unavailable'
      )
    })
    request.on('error', () => settle('unavailable'))
    try {
      request.end()
    } catch {
      settle('unavailable')
    }
  })
}

async function getReleaseAssetReadiness(tag: string, assetName: string): Promise<ReleaseReadiness> {
  const isRelativeAsset = !/^https?:\/\//i.test(assetName)
  const isGitHubReleaseAsset =
    process.platform === 'win32' && (isRelativeAsset || GITHUB_RELEASE_DOWNLOAD_RE.test(assetName))
  const assetUrl = isRelativeAsset
    ? getReleaseAssetUrl(tag, assetName.split('/').findLast(Boolean) ?? assetName)
    : assetName
  if (isGitHubReleaseAsset) {
    return getGitHubReleaseAssetReadiness(assetUrl)
  }

  try {
    const res = await net.fetch(assetUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    })
    if (res.status === 404) {
      return 'not-ready'
    }
    return res.ok ? 'ready' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

export async function getPlatformManifestReadiness(tag: string): Promise<ReleaseReadiness> {
  try {
    // Why: cancelled/draft releases can appear in GitHub's atom feed before
    // they have updater manifests or the ZIP/exe/AppImage assets referenced by
    // those manifests. Pinning to those tags makes download clicks 404.
    const manifestUrl = getReleaseManifestUrl(tag)
    const res = await net.fetch(manifestUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (res.status === 404) {
      return 'not-ready'
    }
    if (!res.ok) {
      return 'unavailable'
    }
    const manifestText = await res.text()
    let parsed: ParsedManifest
    try {
      parsed = parseReleaseManifest(manifestText)
    } catch {
      return 'not-ready'
    }
    const manifestVersion = getManifestVersion(parsed)
    if (manifestVersion !== normalizeTagToVersion(tag)) {
      console.info(
        `[updater] skipping ${tag}: manifest version ${manifestVersion ?? '(missing)'} does not match its tag (ledger mismatch)`
      )
      return 'ledger-mismatch'
    }
    const assetNames = getManifestAssetNames(parsed)
    if (assetNames.length === 0) {
      return 'not-ready'
    }
    const assetResults = await Promise.all(
      assetNames.map((assetName) => getReleaseAssetReadiness(tag, assetName))
    )
    return assetResults.includes('not-ready')
      ? 'not-ready'
      : assetResults.includes('unavailable')
        ? 'unavailable'
        : 'ready'
  } catch {
    return 'unavailable'
  }
}
