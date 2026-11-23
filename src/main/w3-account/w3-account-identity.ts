// Why: strict, bounded parsing of the W3 portal account API. This is the sole
// gate that decides whether the UI may show a trusted signed-in state:
//   - HTTP 421 ("No login user found.") = not logged in yet → keep waiting;
//   - HTTP 200 + parseable employeeNumber/uid = a real W3 session;
//   - anything else = failure. Page load / URL / cookie presence never counts.
// Only `displayName` and `employeeNumber` are surfaced; uid, profile,
// ihrManager and the raw JSON never cross to the renderer or the logs.
import type { W3Identity } from '../../shared/w3-account'

/** Hard cap so a hostile/huge body cannot be parsed into memory unbounded. */
const MAX_BODY_LENGTH = 64 * 1024

/** W3 answers 421 with "No login user found." when the session is not logged in. */
export const W3_NOT_LOGGED_IN_STATUS = 421

export type W3AccountPollResult =
  | { state: 'authenticated'; identity: W3Identity | null }
  | { state: 'unauthenticated' }
  | { state: 'login-failed' }
  | { state: 'parse-failed' }

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
