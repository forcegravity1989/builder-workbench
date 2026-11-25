import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimitService } from './service/rate-limit-service'
import { fetchCursorRateLimits } from './providers/cursor/cursor-fetcher'
import { readCursorAuthSession, type CursorAuthReadResult } from './providers/cursor/cursor-auth'
import { cursorAuthProvenance } from './cursor-usage-account-policy'
import type { ProviderRateLimits } from '../../shared/agent-usage/rate-limits/rate-limit-types'

const { unavailable } = vi.hoisted(() => ({
  unavailable:
    (provider: ProviderRateLimits['provider']) => async (): Promise<ProviderRateLimits> => ({
      provider,
      session: null,
      weekly: null,
      updatedAt: Date.now(),
      error: null,
      status: 'unavailable'
    })
}))

vi.mock('./providers/claude/claude-active-usage-fetch', () => ({
  fetchActiveClaudeRateLimits: unavailable('claude')
}))
vi.mock('./providers/codex/codex-fetcher', () => ({
  fetchCodexRateLimits: unavailable('codex')
}))
vi.mock('./providers/gemini/gemini-usage-fetcher', () => ({
  fetchGeminiRateLimits: unavailable('gemini')
}))
vi.mock('./providers/opencode-go/opencode-go-usage-source-selection', () => ({
  fetchOpenCodeGoUsage: unavailable('opencode-go')
}))
vi.mock('./providers/kimi/kimi-fetcher', () => ({ fetchKimiRateLimits: unavailable('kimi') }))
vi.mock('./providers/minimax/minimax-fetcher', () => ({
  fetchMiniMaxRateLimits: unavailable('minimax')
}))
vi.mock('./providers/grok/grok-fetcher', () => ({ fetchGrokRateLimits: unavailable('grok') }))
vi.mock('./providers/grok/grok-auth', () => ({
  readGrokAuthSession: () => ({ status: 'missing' })
}))
vi.mock('./providers/cursor/cursor-fetcher', () => ({
  fetchCursorRateLimits: vi.fn()
}))
vi.mock('./providers/cursor/cursor-auth', () => ({
  readCursorAuthSession: vi.fn()
}))
vi.mock('./providers/zcode/zcode-usage-fetcher', () => ({
  fetchZcodeRateLimits: unavailable('zcode')
}))
vi.mock('./providers/antigravity/antigravity-usage-fetcher', () => ({
  fetchAntigravityRateLimits: unavailable('antigravity')
}))
vi.mock('./providers/muse/muse-usage-fetcher', () => ({
  fetchMuseRateLimits: unavailable('muse')
}))
vi.mock('../minimax/minimax-cookie-store', () => ({
  hasMiniMaxSessionCookie: async () => false
}))
vi.mock('../minimax/minimax-api-key-store', () => ({ hasMiniMaxApiKey: async () => false }))
vi.mock('../zcode/zcode-plan-api-key-store', () => ({ hasZcodePlanApiKey: async () => false }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function okProvider(
  provider: ProviderRateLimits['provider'],
  usedPercent: number
): ProviderRateLimits {
  return {
    provider,
    session: { usedPercent, windowMinutes: 300, resetsAt: null, resetDescription: null },
    weekly: null,
    updatedAt: Date.now(),
    error: null,
    status: 'ok'
  }
}
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
    vi.mocked(fetchCursorRateLimits).mockReset()
    vi.mocked(readCursorAuthSession).mockReset()
  })

  it('discards account A readings when Cursor changes to B during the request', async () => {
    const accountA = signedIn('account-a')
    vi.mocked(readCursorAuthSession).mockResolvedValue(accountA)
    vi.mocked(fetchCursorRateLimits).mockResolvedValue(reading(accountA))
    const service = new RateLimitService()
    await service.refresh()
    expect((await service.getState()).cursor?.session?.usedPercent).toBe(80)

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

    expect((await service.getState()).cursor).toMatchObject({
      status: 'error',
      session: null,
      weekly: null
    })
    expect((await service.getState()).cursor?.monthly).toBeUndefined()
    expect((await service.getState()).cursorAuthConfigured).toBe(true)
  })

  it('clears the last reading when the Cursor login is removed', async () => {
    const auth = signedIn('account-a')
    vi.mocked(readCursorAuthSession).mockResolvedValue(auth)
    vi.mocked(fetchCursorRateLimits).mockResolvedValue(reading(auth))
    const service = new RateLimitService()
    await service.refresh()
    expect((await service.getState()).cursor?.session?.usedPercent).toBe(80)

    vi.mocked(readCursorAuthSession).mockResolvedValue({ status: 'missing' })
    vi.mocked(fetchCursorRateLimits).mockResolvedValue(await unavailable('cursor')())
    await service.refresh()

    expect((await service.getState()).cursorAuthConfigured).toBe(false)
    expect((await service.getState()).cursor).toMatchObject({
      status: 'unavailable',
      session: null
    })
    expect((await service.getState()).cursor?.buckets).toBeUndefined()
  })
})
