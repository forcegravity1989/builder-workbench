// Why: strict, bounded parsing of the W3 portal account API. This is the sole
// gate that decides whether the UI may show a trusted signed-in state:
//   - HTTP 421 ("No login user found.") = not logged in yet → keep waiting;
//   - HTTP 200 + parseable employeeNumber/uid = a real W3 session;
//   - anything else = failure. Page load / URL / cookie presence never counts.
// Only `displayName` and `employeeNumber` are surfaced; uid, profile,
// ihrManager and the raw JSON never cross to the renderer or the logs.
import type { W3Identity } from '../../shared/w3-account'
import type { W3AccountConfig } from './w3-account-config'

/** Hard cap so a hostile/huge body cannot be parsed into memory unbounded. */
const MAX_BODY_LENGTH = 64 * 1024

/** W3 answers 421 with "No login user found." when the session is not logged in. */
export const W3_NOT_LOGGED_IN_STATUS = 421

export type W3AccountPollResult =
  | { state: 'authenticated'; identity: W3Identity | null }
  | { state: 'unauthenticated' }
  | { state: 'login-failed' }
  | { state: 'parse-failed' }

export type W3FetchResponse = {
  status: number
  url?: string
  /** True when the request failed at the network level (transient). */
  networkError?: boolean
  text: () => Promise<string>
}

export type W3FetchInit = {
  method?: string
  redirect?: 'manual'
  credentials?: 'include'
  signal?: AbortSignal
}

/**
 * One bounded account-API request in the given session partition (cookies
 * included). The per-request timeout covers the response headers AND the
 * body read: a server can return the headers and then stall mid-body, and
 * an unbounded body wait would hang the startup check, the bridge
 * confirmation and every login-poll tick. A stalled body counts as a
 * transient network blip — never a sign-in, not a hard login failure.
 * Identity is only ever trusted from the configured origin, so a
 * followed/misrouted final URL fails even with redirect:'manual'.
 */
export async function checkW3AccountIdentity(
  fetch: (partition: string, url: string, init: W3FetchInit) => Promise<W3FetchResponse>,
  config: W3AccountConfig,
  partition: string,
  timeoutMs: number
): Promise<W3AccountPollResult> {
  const controller = new AbortController()
  // Why a latch next to abort(): abort() alone does not reliably interrupt
  // an already-started body read, so the timeout needs its own resolution.
  let fireTimeoutLatch: (() => void) | null = null
  const timeoutLatch = new Promise<null>((resolve) => {
    fireTimeoutLatch = () => resolve(null)
  })
  const timer = setTimeout(() => {
    controller.abort()
    fireTimeoutLatch?.()
  }, timeoutMs)
  try {
    let response: W3FetchResponse
    try {
      response = await fetch(partition, config.accountApiUrl, {
        redirect: 'manual',
        credentials: 'include',
        signal: controller.signal
      })
    } catch {
      return { state: 'unauthenticated' }
    }
    if (response.networkError || response.status === 0) {
      // Why: a transient network blip is not a login failure — keep waiting
      // (the caller's bounded total timeout still applies).
      return { state: 'unauthenticated' }
    }
    if (
      typeof response.url === 'string' &&
      response.url &&
      new URL(response.url).origin !== config.accountApiOrigin
    ) {
      return { state: 'login-failed' }
    }
    let body = ''
    try {
      const raced = await Promise.race([response.text(), timeoutLatch])
      if (raced === null) {
        return { state: 'unauthenticated' }
      }
      body = raced
    } catch {
      body = ''
    }
    return parseW3AccountResponse(response.status, body)
  } finally {
    clearTimeout(timer)
  }
}

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Normalize the W3 `displayName` array (elements like "cn=张三" / "en=zhangsan",
 * locale tag + 3-char prefix). Prefer the `cn=` Chinese name, then `en=`,
 * then the flat `cn`/`en` fields, then empty.
 */
export function normalizeW3DisplayName(record: Record<string, unknown>): string {
  const list = Array.isArray(record.displayName) ? record.displayName : []
  let cn = ''
  let en = ''
  for (const element of list) {
    const entry = trimmed(element)
    if (!entry) {
      continue
    }
    const match = /^(cn|en)\s*=\s*(.+)$/i.exec(entry)
    if (!match) {
      continue
    }
    if (match[1].toLowerCase() === 'cn' && !cn) {
      cn = match[2].trim()
    } else if (match[1].toLowerCase() === 'en' && !en) {
      en = match[2].trim()
    }
  }
  return cn || en || trimmed(record.cn) || trimmed(record.en)
}

/**
 * Interpret one account-API response. Trusted success requires HTTP 200, a
 * JSON object body, and a non-empty `employeeNumber` or `uid`. When both
 * display fields are absent the caller still treats it as signed-in with no
 * profile info (`identity: null`).
 */
export function parseW3AccountResponse(status: number, bodyText: string): W3AccountPollResult {
  if (status === W3_NOT_LOGGED_IN_STATUS) {
    return { state: 'unauthenticated' }
  }
  if (status !== 200) {
    // Other 4xx/5xx (and 0 = network failure handled by the caller): the
    // deployment answered something we must not treat as a login.
    return { state: 'login-failed' }
  }
  if (typeof bodyText !== 'string' || bodyText.length === 0 || bodyText.length > MAX_BODY_LENGTH) {
    return { state: 'parse-failed' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(bodyText)
  } catch {
    return { state: 'parse-failed' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { state: 'parse-failed' }
  }
  const record = parsed as Record<string, unknown>
  const employeeNo = trimmed(record.employeeNumber)
  const uid = trimmed(record.uid)
  if (!employeeNo && !uid) {
    // A 200 without the identifying fields is not a trusted identity.
    return { state: 'parse-failed' }
  }
  const displayName = normalizeW3DisplayName(record)
  if (!displayName && !employeeNo) {
    return { state: 'authenticated', identity: null }
  }
  return { state: 'authenticated', identity: { displayName, employeeNo } }
}
