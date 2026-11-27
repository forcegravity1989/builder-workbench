// Why: maps the cookies harvested from the controlled system Chrome into the
// dedicated W3 partition. Only the huawei.com registrable family is written
// (the SPES/W3 session lives there); everything else the source saw is
// dropped. Session cookies (no expiry — 80% of the W3 set on a real machine)
// are given a bounded persistent expiry, because Electron never persists
// session cookies across restarts and "sign in once" must survive one.
// The bridge only moves cookies: whether this counts as a login is decided
// exclusively by the W3 account API afterwards (service-level invariant).

import { normalizeCookieDomain } from '../browser/cookies/policy/cookie-domain'
import type { W3SessionSourceResult } from './w3-system-chrome-session-source'

export type W3BridgeCookie = {
  name: string
  value: string
  domain: string
  path: string
  /** Unix epoch seconds; <= 0 means a session cookie. */
  expires: number
  secure: boolean
  httpOnly: boolean
  sameSite?: string
}

export type W3CookieSetDetails = {
  url: string
  name: string
  value: string
  domain?: string
  path: string
  secure: boolean
  httpOnly: boolean
  expirationDate?: number
  sameSite?: 'no_restriction' | 'lax' | 'strict'
}

/** Only this registrable family is ever transplanted into the W3 partition. */
export const W3_BRIDGE_COOKIE_FAMILY = 'huawei.com'
/** Bounded persistent expiry given to session cookies (survives restarts). */
export const W3_BRIDGE_SESSION_COOKIE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function isW3BridgeFamilyDomain(domain: string): boolean {
  const normalized = normalizeCookieDomain(domain)
  if (!normalized) {
    return false
  }
  return (
    normalized === W3_BRIDGE_COOKIE_FAMILY || normalized.endsWith(`.${W3_BRIDGE_COOKIE_FAMILY}`)
  )
}

function mapSameSite(
  sameSite: string | undefined,
  secure: boolean
): 'no_restriction' | 'lax' | 'strict' | undefined {
  if (sameSite === 'Strict') {
    return 'strict'
  }
  if (sameSite === 'Lax') {
    return 'lax'
  }
  if (sameSite === 'None') {
    // Why the secure gate: Chromium rejects SameSite=None without Secure, so
    // forwarding it would drop the cookie instead of persisting it.
    return secure ? 'no_restriction' : undefined
  }
  return undefined
}

/**
 * Filter + map harvested cookies into Electron `cookies.set` details. Pure:
 * same input → same output, so the transplant protocol is unit-testable.
 */
export function mapBridgeCookiesForPartition(
  cookies: readonly W3BridgeCookie[],
  nowMs: number
): W3CookieSetDetails[] {
  const details: W3CookieSetDetails[] = []
  for (const cookie of cookies) {
    if (!isW3BridgeFamilyDomain(cookie.domain)) {
      continue
    }
    const normalized = normalizeCookieDomain(cookie.domain)
    if (!normalized) {
      continue
    }
    const path = cookie.path.startsWith('/') ? cookie.path : '/'
    // Why hostOnly from the leading dot: CDP marks host-only cookies by the
    // absence of a leading dot; passing such a domain through would widen the
    // cookie to the whole family.
    const hostOnly = !cookie.domain.startsWith('.')
    const expirationDate =
      cookie.expires > 0
        ? cookie.expires
        : Math.floor((nowMs + W3_BRIDGE_SESSION_COOKIE_TTL_MS) / 1000)
    details.push({
      url: `${cookie.secure ? 'https' : 'http'}://${normalized}${path}`,
      name: cookie.name,
      value: cookie.value,
      ...(hostOnly ? {} : { domain: cookie.domain }),
      path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      expirationDate,
      sameSite: mapSameSite(cookie.sameSite, cookie.secure)
    })
  }
  return details
}

export type W3SessionBridgeDeps = {
  collect: (signal?: AbortSignal) => Promise<W3SessionSourceResult>
  setCookie: (details: W3CookieSetDetails) => Promise<void>
  now: () => number
  signal?: AbortSignal
}

export type W3SessionBridgeResult =
  | { ok: true; imported: number; failed: number }
  | { ok: false; reason: W3SessionBridgeFailure }

export type W3SessionBridgeFailure =
  | 'chrome-not-found'
  | 'launch-failed'
  | 'debug-port-timeout'
  | 'sso-failed'
  | 'cookie-read-failed'
  | 'aborted'

/**
 * Harvest from the controlled system Chrome and transplant into the W3
 * partition. Individual cookie writes are best-effort (a partial transplant is
 * still validated by the account API); only the counts are reported so no
 * cookie value ever reaches a log line.
 */
export async function syncW3SessionFromSystemBrowser(
  deps: W3SessionBridgeDeps
): Promise<W3SessionBridgeResult> {
  const collected = await deps.collect(deps.signal)
  if (!collected.ok) {
    return collected
  }
  const details = mapBridgeCookiesForPartition(collected.cookies, deps.now())
  let imported = 0
  let failed = 0
  for (const detail of details) {
    // Why check per write: a sign-out aborts mid-transplant, and cookies must
    // not keep landing in a partition the user just asked to clear.
    if (deps.signal?.aborted) {
      return { ok: false, reason: 'aborted' }
    }
    try {
      await deps.setCookie(detail)
      imported += 1
    } catch {
      failed += 1
    }
  }
  return { ok: true, imported, failed }
}
