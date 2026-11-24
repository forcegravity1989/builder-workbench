import { describe, expect, it } from 'vitest'
import {
  mapBridgeCookiesForPartition,
  syncW3SessionFromSystemBrowser,
  W3_BRIDGE_COOKIE_FAMILY,
  W3_BRIDGE_SESSION_COOKIE_TTL_MS,
  type W3BridgeCookie,
  type W3SessionBridgeDeps
} from './w3-session-bridge'

const NOW_MS = 1_700_000_000_000

function cookie(overrides: Partial<W3BridgeCookie> = {}): W3BridgeCookie {
  return {
    name: 'SESSION',
    value: 'v',
    domain: '.huawei.com',
    path: '/',
    expires: 0,
    secure: true,
    httpOnly: true,
    sameSite: undefined,
    ...overrides
  }
}

describe('W3 session bridge cookie protocol', () => {
  it('maps CDP cookies to Electron set details: family filter, hostOnly, session TTL, SameSite', () => {
    const details = mapBridgeCookiesForPartition(
      [
        // Dropped: outside the huawei.com registrable family.
        cookie({ name: 'ga', domain: '.google.com' }),
        cookie({ name: 'evil', domain: 'not-huawei.com' }),
        // Domain cookie (leading dot): domain is forwarded.
        cookie({ name: 'sso', domain: '.huawei.com', sameSite: 'None' }),
        // Host-only cookie (no leading dot): domain must NOT be forwarded,
        // or the cookie would widen to the whole family.
        cookie({ name: 'w3host', domain: 'w3.huawei.com', sameSite: 'Lax' }),
        // Session cookie (no expiry): gets the bounded persistent TTL.
        cookie({ name: 'sess', domain: '.huawei.com' }),
        // CDP's actual session-cookie marker is expires: -1, not 0 — the
        // mapping must treat both as session cookies.
        cookie({ name: 'sess-neg', domain: '.huawei.com', expires: -1 }),
        // Persistent cookie keeps its own expiry.
        cookie({ name: 'perm', domain: '.huawei.com', expires: 1_800_000_000 }),
        // SameSite=None without Secure is dropped by Chromium, so it must not
        // be forwarded as no_restriction.
        cookie({ name: 'insecure-none', domain: '.huawei.com', secure: false, sameSite: 'None' })
      ],
      NOW_MS
    )

    expect(details.map((detail) => detail.name)).toEqual([
      'sso',
      'w3host',
      'sess',
      'sess-neg',
      'perm',
      'insecure-none'
    ])

    const sso = details[0]
    expect(sso).toMatchObject({
      url: 'https://huawei.com/',
      domain: '.huawei.com',
      sameSite: 'no_restriction',
      secure: true,
      httpOnly: true
    })
    // Host-only: no domain field, url carries the exact host.
    expect(details[1]).toMatchObject({ url: 'https://w3.huawei.com/' })
    expect(details[1]).not.toHaveProperty('domain')
    // Session cookie: bounded 7-day persistent expiry (survives restarts).
    expect(details[2].expirationDate).toBe(
      Math.floor((NOW_MS + W3_BRIDGE_SESSION_COOKIE_TTL_MS) / 1000)
    )
    // CDP's expires: -1 is a session cookie too — same bounded TTL.
    expect(details[3].expirationDate).toBe(
      Math.floor((NOW_MS + W3_BRIDGE_SESSION_COOKIE_TTL_MS) / 1000)
    )
    // Persistent cookie: its own expiry is kept untouched.
    expect(details[4].expirationDate).toBe(1_800_000_000)
    // Insecure SameSite=None: sameSite omitted so the write is not rejected.
    expect(details[5]).toMatchObject({ url: 'http://huawei.com/', secure: false })
    expect(details[5].sameSite).toBeUndefined()
  })

  it('transplant reports counts only: harvest failure passes through, writes are best-effort', async () => {
    const setDetails: unknown[] = []
    const baseDeps = (collect: W3SessionBridgeDeps['collect']): W3SessionBridgeDeps => ({
      collect,
      setCookie: async (detail) => {
        setDetails.push(detail)
        if (detail.name === 'bad') {
          throw new Error('rejected')
        }
      },
      now: () => NOW_MS
    })

    // Harvest failure passes the reason through untouched.
    const failed = await syncW3SessionFromSystemBrowser(
      baseDeps(async () => ({ ok: false, reason: 'chrome-not-found' }))
    )
    expect(failed).toEqual({ ok: false, reason: 'chrome-not-found' })

    // Success: one rejected write is counted, the rest still import.
    const ok = await syncW3SessionFromSystemBrowser(
      baseDeps(async () => ({
        ok: true,
        cookies: [
          cookie({ name: 'good', domain: '.huawei.com' }),
          cookie({ name: 'bad', domain: '.huawei.com' }),
          cookie({ name: 'ga', domain: '.google.com' })
        ]
      }))
    )
    expect(ok).toEqual({ ok: true, imported: 1, failed: 1 })
    // Only family cookies reach cookies.set — no values are logged anywhere.
    expect(setDetails).toHaveLength(2)
    expect(W3_BRIDGE_COOKIE_FAMILY).toBe('huawei.com')
  })
})
