import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimitService } from './service'
import { fetchCursorRateLimits } from './cursor-fetcher'
import { readCursorAuthSession, type CursorAuthReadResult } from './cursor-auth'
import { cursorAuthProvenance } from './cursor-usage-account-policy'
import { fetchClaudeRateLimits } from './claude-fetcher'
import { fetchCodexRateLimits } from './codex-fetcher'
import {
  deferred,
  okProvider,
  resetRateLimitProviderMocks,
  unavailableProvider
} from './rate-limit-service-test-harness'
import type { ProviderRateLimits } from '../../shared/rate-limit-types'

vi.mock('./claude-fetcher', () => ({
  fetchClaudeRateLimits: vi.fn(),
  fetchManagedAccountUsage: vi.fn()
}))
vi.mock('./codex-fetcher', () => ({
  consumeCodexRateLimitResetCredit: vi.fn(),
  fetchCodexRateLimits: vi.fn()
}))
vi.mock('./gemini-usage-fetcher', () => ({ fetchGeminiRateLimits: vi.fn() }))
vi.mock('./kimi-fetcher', () => ({ fetchKimiRateLimits: vi.fn() }))
vi.mock('./opencode-go-usage-fetcher', () => ({ fetchOpenCodeGoRateLimits: vi.fn() }))
vi.mock('./minimax/minimax-fetcher', () => ({ fetchMiniMaxRateLimits: vi.fn() }))
vi.mock('./grok-fetcher', () => ({ fetchGrokRateLimits: vi.fn() }))
vi.mock('./grok-auth', () => ({ readGrokAuthSession: vi.fn() }))
vi.mock('./cursor-fetcher', () => ({ fetchCursorRateLimits: vi.fn() }))
vi.mock('./cursor-auth', () => ({ readCursorAuthSession: vi.fn() }))
vi.mock('../minimax/minimax-cookie-store', () => ({ hasMiniMaxSessionCookie: vi.fn() }))
vi.mock('../minimax/minimax-api-key-store', () => ({ hasMiniMaxApiKey: vi.fn(() => false) }))

function signedIn(subject: string): CursorAuthReadResult {
  return {
    status: 'ok',
    session: {
      token: { raw: 'fixture-token', subject, expiresAtMs: 4_000_000_000_000 },
      source: 'cli',
      email: null,
      displayName: null,
      membershipType: 'pro',
      subscriptionStatus: 'active'
    }
  }
}

function reading(auth: CursorAuthReadResult): ProviderRateLimits {
  return {
    ...okProvider('cursor', 80),
    usageMetadata: { source: 'cli', authProvenance: cursorAuthProvenance(auth)! }
  }
}

describe('Cursor account ownership across usage refreshes', () => {
  beforeEach(() => {
    resetRateLimitProviderMocks()
    vi.mocked(fetchClaudeRateLimits).mockResolvedValue(okProvider('claude', 0))
    vi.mocked(fetchCodexRateLimits).mockResolvedValue(okProvider('codex', 0))
  })

  it('discards account A readings when Cursor changes to B during the request', async () => {
    const accountA = signedIn('account-a')
    vi.mocked(readCursorAuthSession).mockResolvedValue(accountA)
    vi.mocked(fetchCursorRateLimits).mockResolvedValue(reading(accountA))
    const service = new RateLimitService()
    await service.refresh()
    expect(service.getState().cursor?.session?.usedPercent).toBe(80)

    const started = deferred<void>()
    const pending = deferred<ProviderRateLimits>()
    vi.mocked(fetchCursorRateLimits).mockImplementationOnce(() => {
      started.resolve()
      return pending.promise
    })
    const refresh = service.refresh()
    await started.promise
    vi.mocked(readCursorAuthSession).mockResolvedValue(signedIn('account-b'))
    pending.resolve(reading(accountA))
    await refresh

    expect(service.getState().cursor).toMatchObject({ status: 'error', session: null, weekly: null })
    expect(service.getState().cursor?.monthly).toBeUndefined()
    expect(service.getState().cursorAuthConfigured).toBe(true)
  })

  it('clears the last reading when the Cursor login is removed', async () => {
    const auth = signedIn('account-a')
    vi.mocked(readCursorAuthSession).mockResolvedValue(auth)
    vi.mocked(fetchCursorRateLimits).mockResolvedValue(reading(auth))
    const service = new RateLimitService()
    await service.refresh()
    expect(service.getState().cursor?.session?.usedPercent).toBe(80)

    vi.mocked(readCursorAuthSession).mockResolvedValue({ status: 'missing' })
    vi.mocked(fetchCursorRateLimits).mockResolvedValue(unavailableProvider('cursor'))
    await service.refresh()

    expect(service.getState().cursorAuthConfigured).toBe(false)
    expect(service.getState().cursor).toMatchObject({ status: 'unavailable', session: null })
    expect(service.getState().cursor?.buckets).toBeUndefined()
  })
})
