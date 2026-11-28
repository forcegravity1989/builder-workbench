// Why: OneBox (onebox.huawei.com) is the only source that maps a WeLink group
// name to its group-space id, and the only source of the group-chat id
// (`customId`) behind a space. welink-cli exposes neither — see
// docs/05-features/team-collaboration/welink-cli-spike.md. The calls ride the
// W3 account partition, so the passwordless SSO the user already configured is
// reused; no credential is stored or logged here.
//
// Probed facts this module encodes (onebox.huawei.com, 2026-11-28):
// - the entry route answers 200 with an SPA shell and no HTTP redirects: its
//   JavaScript performs the SSO handshake and only then seeds the
//   `WAPCSRFTOKEN` cookie, so the session warm-up must run in a real browser
//   context — a plain fetch never executes that JS and never sees the cookie;
// - the only required request header is `csrftoken`, byte-identical to the
//   `WAPCSRFTOKEN` cookie; without it both APIs answer 403 "CSRF check failed";
// - `teamSpaceList` paging metadata is unusable (`totalElements` and
//   `totalPages` are always 0, `lastPage` only flips on the final page), so
//   paging stops on a short or empty page;
// - `teamSpaceList` has no server-side name filter (`name`, `keyword`,
//   `searchValue`, `query` are all ignored), so the whole list is fetched once
//   and matched in the renderer;
// - the list carries no group-chat id, so `openGetTeamInfo` is called only for
//   the single space the user picked.

import type {
  TeamGroupSpaceListFailure,
  TeamGroupSpaceListResult,
  TeamGroupSpaceOption,
  TeamGroupSpaceResolveResult
} from '../../../shared/team-group-discovery'

export const ONEBOX_ORIGIN = 'https://onebox.huawei.com'
/** Entry route whose page JS seeds the WAPCSRFTOKEN cookie via the SSO handshake. */
export const ONEBOX_ENTRY_URL = `${ONEBOX_ORIGIN}/`
const TEAM_SPACE_LIST_PATH = '/perfect/teamspace/teamSpaceList'
const TEAM_INFO_PATH = '/perfect/teamspace/openGetTeamInfo'
export const CSRF_COOKIE_NAME = 'WAPCSRFTOKEN'
const CSRF_HEADER_NAME = 'csrftoken'
/** Landing here instead of OneBox means the W3 SSO cookies did not carry over. */
export const SSO_LOGIN_MARKER = 'login.huawei.com'
/** Auto-created eMeeting spaces have no WeLink group, so they are never bindable. */
const MEETING_SPACE_NAME_PREFIX = 'emeeting-'
const NUMERIC_ID = /^\d{1,32}$/
const RATE_LIMIT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000]

export const ONEBOX_PAGE_SIZE = 80
/** 346 spaces took 5 pages when probed; this only bounds a runaway walk. One
 * probe page past the cap decides the `truncated` flag exactly. */
export const ONEBOX_MAX_PAGES = 20

export type OneboxFetchInit = {
  headers?: Record<string, string>
  signal?: AbortSignal
}

export type OneboxFetchResponse = {
  status: number
  url: string
  /** Transport-level failure: no HTTP status was produced at all. */
  networkError?: boolean
  text(): Promise<string>
}

export type OneboxGroupSpaceDeps = {
  /** The W3 partition OneBox accepts, or why no usable one exists. */
  resolvePartition: () => Promise<
    { partition: string } | { failure: 'w3-unconfigured' | 'w3-not-signed-in' }
  >
  /**
   * Load the entry page in a real (hidden) browser context on the partition and
   * hold it until the CSRF cookie appears or a bounded wait expires. A plain
   * fetch cannot stand in: the page's JS performs the SSO handshake.
   */
  warmSession: (partition: string) => Promise<{ finalUrl: string; networkError?: boolean }>
  fetch: (partition: string, url: string, init?: OneboxFetchInit) => Promise<OneboxFetchResponse>
  /** The CSRF cookie value for the OneBox origin, or null when the session never got one. */
  readCsrfCookie: (partition: string, cookieName: string) => Promise<string | null>
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

type ResolvedDeps = Omit<OneboxGroupSpaceDeps, 'now' | 'sleep'> & {
  now: () => number
  sleep: (ms: number) => Promise<void>
}

type OneboxSession = { partition: string; csrf: string }

export type TeamSpacePage = { options: TeamGroupSpaceOption[]; rawCount: number }

export type TeamGroupIdParse =
  | { kind: 'group'; groupId: string }
  | { kind: 'no-group' }
  | { kind: 'invalid' }

function resolveDeps(deps: OneboxGroupSpaceDeps): ResolvedDeps {
  return {
    ...deps,
    now: deps.now ?? (() => Date.now()),
    sleep: deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  }
}

function toNumericId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return String(value)
  }
  if (typeof value === 'string' && NUMERIC_ID.test(value)) {
    return value
  }
  return null
}

function toMemberCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function isMeetingSpaceName(name: string): boolean {
  return name.toLowerCase().startsWith(MEETING_SPACE_NAME_PREFIX)
}

/**
 * Parse one `teamSpaceList` page. `rawCount` is the pre-filter item count: the
 * paging stop rule must read the server's page size, not what survived
 * filtering. Returns null when the payload is not a readable list envelope.
 */
export function parseTeamSpacePage(body: string): TeamSpacePage | null {
  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return null
  }
  const content = (payload as { data?: { content?: unknown } } | null)?.data?.content
  if (!Array.isArray(content)) {
    return null
  }
  const options: TeamGroupSpaceOption[] = []
  for (const raw of content) {
    if (!raw || typeof raw !== 'object') {
      continue
    }
    const item = raw as Record<string, unknown>
    const spaceId = toNumericId(item.id)
    const name = toText(item.name)
    if (spaceId === null || name === '' || isMeetingSpaceName(name)) {
      continue
    }
    options.push({
      spaceId,
      name,
      memberCount: toMemberCount(item.curNumbers),
      ownerName: toText(item.ownedByUserName)
    })
  }
  return { options, rawCount: content.length }
}

/**
 * Pull the WeLink group-chat id out of an `openGetTeamInfo` payload. `no-group`
 * means OneBox answered fine but the space has no `customId` — an eMeeting
 * space, or a space whose group was dissolved.
 */
export function parseTeamGroupId(body: string): TeamGroupIdParse {
  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return { kind: 'invalid' }
  }
  const data = (payload as { data?: unknown } | null)?.data
  if (!data || typeof data !== 'object') {
    return { kind: 'invalid' }
  }
  const attributes = (data as { extendedAttributes?: unknown }).extendedAttributes
  if (!Array.isArray(attributes)) {
    return { kind: 'no-group' }
  }
  for (const raw of attributes) {
    if (!raw || typeof raw !== 'object') {
      continue
    }
    const attribute = raw as Record<string, unknown>
    if (attribute.name !== 'customId') {
      continue
    }
    const groupId = toNumericId(attribute.value)
    return groupId === null ? { kind: 'no-group' } : { kind: 'group', groupId }
  }
  return { kind: 'no-group' }
}

/**
 * Run the entry page once in a real browser context so its JS completes the
 * SSO handshake and seeds the CSRF cookie, then read the cookie back. The
 * cookie is host-scoped to OneBox, so it is absent from a freshly harvested
 * W3 partition until this first page load runs.
 */
async function acquireSession(
  deps: ResolvedDeps
): Promise<{ session: OneboxSession } | { failure: TeamGroupSpaceListFailure }> {
  const resolved = await deps.resolvePartition()
  if ('failure' in resolved) {
    return { failure: resolved.failure }
  }
  // The status itself is ignored: what matters is whether the page ended up on
  // OneBox (not the SSO login page) and left a CSRF cookie behind.
  const warm = await deps.warmSession(resolved.partition)
  if (warm.networkError) {
    return { failure: 'unreachable' }
  }
  if (warm.finalUrl.includes(SSO_LOGIN_MARKER)) {
    return { failure: 'onebox-unauthorized' }
  }
  const csrf = await deps.readCsrfCookie(resolved.partition, CSRF_COOKIE_NAME)
  if (!csrf) {
    return { failure: 'onebox-unauthorized' }
  }
  return { session: { partition: resolved.partition, csrf } }
}

async function getOneboxJson(
  deps: ResolvedDeps,
  session: OneboxSession,
  url: string
): Promise<{ body: string } | { failure: TeamGroupSpaceListFailure }> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await deps.fetch(session.partition, url, {
      headers: { [CSRF_HEADER_NAME]: session.csrf }
    })
    if (response.networkError) {
      return { failure: 'unreachable' }
    }
    if (response.status === 401 || response.status === 403) {
      return { failure: 'onebox-unauthorized' }
    }
    if (response.status === 429) {
      const delay = RATE_LIMIT_RETRY_DELAYS_MS[attempt]
      if (delay === undefined) {
        return { failure: 'rate-limit' }
      }
      await deps.sleep(delay)
      continue
    }
    if (response.status !== 200) {
      return { failure: 'unreachable' }
    }
    return { body: await response.text() }
  }
}

/** Every WeLink group space the signed-in W3 account can see, newest first. */
export async function listTeamGroupSpaces(
  deps: OneboxGroupSpaceDeps
): Promise<TeamGroupSpaceListResult> {
  const resolved = resolveDeps(deps)
  const acquired = await acquireSession(resolved)
  if ('failure' in acquired) {
    return { ok: false, reason: acquired.failure }
  }
  const spaces: TeamGroupSpaceOption[] = []
  const seen = new Set<string>()
  let truncated = false
  const listUrl = (pageNumber: number) =>
    `${ONEBOX_ORIGIN}${TEAM_SPACE_LIST_PATH}?pageNumber=${pageNumber}` +
    `&pageSize=${ONEBOX_PAGE_SIZE}&mode=new&appIdValue=espace&_=${resolved.now()}`
  for (let pageNumber = 1; ; pageNumber += 1) {
    const result = await getOneboxJson(resolved, acquired.session, listUrl(pageNumber))
    if ('failure' in result) {
      return { ok: false, reason: result.failure }
    }
    const page = parseTeamSpacePage(result.body)
    if (page === null) {
      return { ok: false, reason: 'parse-failed' }
    }
    for (const option of page.options) {
      if (!seen.has(option.spaceId)) {
        seen.add(option.spaceId)
        spaces.push(option)
      }
    }
    if (page.rawCount < ONEBOX_PAGE_SIZE) {
      break
    }
    if (pageNumber >= ONEBOX_MAX_PAGES) {
      // Probe one page past the cap so `truncated` only claims groups are
      // actually missing, never that the cap coincided with the exact end.
      // A failed probe keeps the loaded pages and reports truncated — the
      // honest direction when completeness is unknown.
      const probe = await getOneboxJson(resolved, acquired.session, listUrl(ONEBOX_MAX_PAGES + 1))
      if ('failure' in probe) {
        truncated = true
        break
      }
      const probePage = parseTeamSpacePage(probe.body)
      truncated = probePage === null || probePage.rawCount > 0
      break
    }
  }
  return { ok: true, spaces, truncated }
}

/** The WeLink group-chat id behind one group space. */
export async function resolveTeamGroupId(
  deps: OneboxGroupSpaceDeps,
  spaceId: string
): Promise<TeamGroupSpaceResolveResult> {
  const normalized = toNumericId(spaceId)
  if (normalized === null) {
    return { ok: false, reason: 'parse-failed' }
  }
  const resolved = resolveDeps(deps)
  const acquired = await acquireSession(resolved)
  if ('failure' in acquired) {
    return { ok: false, reason: acquired.failure }
  }
  const url = `${ONEBOX_ORIGIN}${TEAM_INFO_PATH}?teamId=${normalized}&_=${resolved.now()}`
  const result = await getOneboxJson(resolved, acquired.session, url)
  if ('failure' in result) {
    return { ok: false, reason: result.failure }
  }
  const parsed = parseTeamGroupId(result.body)
  if (parsed.kind === 'invalid') {
    return { ok: false, reason: 'parse-failed' }
  }
  if (parsed.kind === 'no-group') {
    return { ok: false, reason: 'not-a-group-space' }
  }
  return { ok: true, spaceId: normalized, groupId: parsed.groupId }
}
