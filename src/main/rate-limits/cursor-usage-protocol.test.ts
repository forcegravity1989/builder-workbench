import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { net } from 'electron'
import { setMainHttpClient } from '../network/http-client'
import { fetchCursorRateLimits } from './cursor-fetcher'
import {
  cursorSessionCookie,
  isCursorSessionTokenExpired,
  parseCursorSessionToken
} from './cursor-session-token'
import {
  mapCursorCurrentPeriodUsage,
  mapCursorLegacyRequestQuota,
  mapCursorUsageSummary,
  parseCursorUsageSummary
} from './cursor-usage-mapping'
import {
  cursorAuthProvenance,
  previousCursorUsageForAccount
} from './cursor-usage-account-policy'
import type { CursorAuthReadResult } from './cursor-auth'
import type { ProviderRateLimits } from '../../shared/rate-limit-types'

vi.mock('electron', () => ({ net: { fetch: vi.fn() } }))

const SUMMARY_URL = 'https://cursor.com/api/usage-summary'
const CURRENT_URL = 'https://cursor.com/api/dashboard/get-current-period-usage'
const START = '2026-10-18T06:32:13.504Z'
const END = '2026-10-25T06:32:13.504Z'
const SUMMARY = {
  membershipType: 'unified_ultra',
  billingCycleStart: '2026-10-01T00:00:00.000Z',
  billingCycleEnd: '2026-11-01T00:00:00.000Z',
  individualUsage: {
    plan: {
      enabled: true, used: 0, limit: 55395,
      totalPercentUsed: 0, autoPercentUsed: 0, apiPercentUsed: 0
    },
    onDemand: { enabled: true, used: 25, limit: 100 }
  }
}
const AUTH: Extract<CursorAuthReadResult, { status: 'ok' }> = {
  status: 'ok',
  session: {
    token: { raw: 'fixture-token', subject: 'account-a', expiresAtMs: 4_000_000_000_000 },
    source: 'cli', email: null, displayName: null, membershipType: null, subscriptionStatus: null
  }
}

beforeEach(() => {
  vi.mocked(net.fetch).mockReset()
  setMainHttpClient({ fetch: (url, init) => net.fetch(url, init), proxySession: () => null })
})

afterEach(() => setMainHttpClient(null))

describe('Cursor quota data protocols', () => {
  it('rejects malformed JWT subjects and preserves cookie ownership and expiry boundaries', () => {
    expect(parseCursorSessionToken('not-a-token')).toBeNull()
    const emptySubject = Buffer.from(JSON.stringify({ sub: ' ' })).toString('base64url')
    expect(parseCursorSessionToken(`header.${emptySubject}.signature`)).toBeNull()
    const payload = Buffer.from(JSON.stringify({ sub: 'auth0|user_a', exp: 1000 })).toString('base64url')
    const token = parseCursorSessionToken(`header.${payload}.signature`)!
    expect(token).toMatchObject({ subject: 'auth0|user_a', expiresAtMs: 1_000_000 })
    expect(isCursorSessionTokenExpired(token, 999_999)).toBe(false)
    expect(isCursorSessionTokenExpired(token, 1_000_000)).toBe(true)
    expect(cursorSessionCookie(token)).toBe(`WorkosCursorSessionToken=auth0%7Cuser_a%3A%3A${token.raw}`)
  })

  it('prefers reported plan totals and team member allowance without using team-wide spend', () => {
    const mapped = mapCursorUsageSummary(parseCursorUsageSummary({
      ...SUMMARY,
      individualUsage: {
        plan: {
          enabled: true, used: '21', limit: '40',
          totalPercentUsed: 53, autoPercentUsed: 12, apiPercentUsed: 80
        },
        onDemand: null
      }
    }))
    expect(mapped.monthly?.usedPercent).toBe(53)
    expect(mapped.buckets.map(({ name, usedPercent }) => ({ name, usedPercent }))).toEqual([
      { name: 'Cursor Models', usedPercent: 12 }, { name: 'Other Models', usedPercent: 80 }
    ])
    expect(mapCursorUsageSummary(parseCursorUsageSummary(null))).toMatchObject({
      monthly: null, buckets: []
    })
    for (const plan of [null, { enabled: false, totalPercentUsed: 0 }]) {
      const team = mapCursorUsageSummary(parseCursorUsageSummary({
        membershipType: 'team',
        individualUsage: { plan, overall: { enabled: true, used: 10, limit: 100, totalPercentUsed: 64 } },
        teamUsage: { onDemand: { enabled: true, used: 100, limit: 100 } }
      }))
      expect(team.monthly?.usedPercent).toBe(64)
      expect(team.buckets).toEqual([])
    }
    expect(mapCursorLegacyRequestQuota({
      'gpt-4': { numRequests: 25, maxRequestUsage: 50 }, startOfMonth: '2026-01-31T00:00:00Z'
    })).toMatchObject({ usedPercent: 50, resetsAt: Date.parse('2026-02-28T00:00:00Z') })
  })

  it('maps current weekly periods including genuine zeros without inventing malformed periods', () => {
    const current = {
      billingCycleStart: START, billingCycleEnd: END,
      planUsage: { totalPercentUsed: '0', autoPercentUsed: 0, apiPercentUsed: 0 }
    }
    expect(mapCursorCurrentPeriodUsage(current)).toMatchObject({
      periodMinutes: 10080,
      monthly: { usedPercent: 0, windowMinutes: 10080, resetsAt: Date.parse(END) }
    })
    expect(mapCursorCurrentPeriodUsage({ ...current, billingCycleEnd: START })).toBeNull()
    expect(mapCursorCurrentPeriodUsage({ ...current, planUsage: {} })).toBeNull()
  })

  it('uses the selected credential for a current-period POST and preserves independently billed on-demand usage', async () => {
    vi.mocked(net.fetch).mockImplementation(async (url) => Response.json(url === SUMMARY_URL ? SUMMARY : {
      billingCycleStart: START, billingCycleEnd: END,
      planUsage: {
        totalPercentUsed: 1.112013719649788, autoPercentUsed: 1.112013719649788, apiPercentUsed: 0
      }
    }))
    const limits = await fetchCursorRateLimits({ authReadResult: AUTH })
    expect(limits.monthly).toMatchObject({
      usedPercent: 1.112013719649788, windowMinutes: 10080, resetsAt: Date.parse(END)
    })
    expect(limits.buckets).toContainEqual(expect.objectContaining({
      name: 'On-demand', usedPercent: 25, resetsAt: Date.parse(SUMMARY.billingCycleEnd)
    }))
    expect(net.fetch).toHaveBeenCalledTimes(2)
    const requests = vi.mocked(net.fetch).mock.calls
    expect(requests.map(([url]) => url)).toEqual([SUMMARY_URL, CURRENT_URL])
    expect(requests.every(([, init]) => init?.credentials === 'omit')).toBe(true)
    expect(requests[1]?.[1]).toMatchObject({
      method: 'POST', body: '{}', redirect: 'manual',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'WorkosCursorSessionToken=account-a%3A%3Afixture-token',
        Origin: 'https://cursor.com', Referer: 'https://cursor.com/dashboard'
      }
    })
  })

  it('propagates current-period failures and bounded Retry-After instead of obsolete summary zeros', async () => {
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    const date = new Date(Math.ceil(now / 1000) * 1000 + 90_000).toUTCString()
    const cases = [
      { status: 401, retryAfter: '60', delay: null },
      { status: 403, retryAfter: '60', delay: null },
      { status: 302, retryAfter: '60', delay: null },
      { status: 429, retryAfter: '60', delay: 60_000 },
      { status: 429, retryAfter: date, delay: Date.parse(date) - now },
      { status: 429, retryAfter: '172800', delay: 86_400_000 },
      { status: 429, retryAfter: 'soon', delay: null },
      { status: 503, retryAfter: '60', delay: null }
    ]
    try {
      for (const { status, retryAfter, delay } of cases) {
        vi.mocked(net.fetch).mockReset().mockImplementation(async (url) => url === SUMMARY_URL
          ? Response.json(SUMMARY)
          : new Response(null, { status, headers: { 'retry-after': retryAfter } }))
        const limits = await fetchCursorRateLimits({ authReadResult: AUTH })
        expect(limits.status).toBe('error')
        expect(limits.monthly).toBeUndefined()
        expect(limits.buckets).toBeUndefined()
        expect(limits.usageMetadata).toMatchObject({
          authProvenance: cursorAuthProvenance(AUTH),
          failureKind: status === 401 ? 'stale-token' : status === 429 ? 'rate-limited' : 'server'
        })
        expect(limits.usageMetadata?.retryAtMs).toBe(delay === null ? undefined : now + delay)
        expect(net.fetch).toHaveBeenCalledTimes(2)
      }
    } finally {
      clock.mockRestore()
    }
  })

  it('allows stale readings only for the same proven account', () => {
    const provenance = cursorAuthProvenance(AUTH)!
    const previous: ProviderRateLimits = {
      provider: 'cursor', session: null, weekly: null, updatedAt: 1, error: null, status: 'ok',
      monthly: { usedPercent: 60, windowMinutes: 43200, resetsAt: null, resetDescription: null },
      usageMetadata: { authProvenance: provenance }
    }
    expect(previousCursorUsageForAccount(provenance, previous)).toBe(previous)
    expect(previousCursorUsageForAccount('different-account', previous)).toBeNull()
    expect(previousCursorUsageForAccount(cursorAuthProvenance({ status: 'missing' }), previous)).toBeNull()
    expect(previousCursorUsageForAccount(undefined, previous)).toBeNull()
  })
})
