import { join } from 'node:path'
import { cancelTrackingResponse } from '../lib/unread-response-body.test-fixtures'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { childSpawnMock, readFileMock, ptySpawnMock, backfillPendingMock, backfillRecoveryMock } =
  vi.hoisted(() => ({
    childSpawnMock: vi.fn(),
    readFileMock: vi.fn(),
    ptySpawnMock: vi.fn(),
    backfillPendingMock: vi.fn(() => false),
    backfillRecoveryMock: vi.fn(() => Promise.resolve(null))
  }))

vi.mock('node:child_process', () => ({ spawn: childSpawnMock }))
vi.mock('node:fs/promises', () => ({ readFile: readFileMock }))
vi.mock('node-pty', () => ({ spawn: ptySpawnMock }))
vi.mock('../codex/codex-state-db', () => ({
  isCodexStateDbBackfillPending: backfillPendingMock
}))
vi.mock('../codex/codex-state-db-backfill-recovery', () => ({
  startCodexStateDbBackfillRecoveryInBackground: backfillRecoveryMock
}))
vi.mock('./codex-auth-presence', () => ({
  probeCodexAuthPresence: vi.fn(async () => 'present')
}))

import { consumeCodexRateLimitResetCredit, fetchCodexRateLimits } from './codex-fetcher'

const AUTH = JSON.stringify({
  tokens: { access_token: 'scoped-token', account_id: 'scoped-account' }
})

function backendUsageResponse(): Response {
  return Response.json({
    plan_type: 'plus',
    rate_limit: {
      primary_window: { used_percent: 12, limit_window_seconds: 18_000 },
      secondary_window: { used_percent: 34, limit_window_seconds: 604_800 }
    },
    rate_limit_reset_credits: { available_count: 0 }
  })
}

describe('Codex backend rate-limit requests', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    backfillPendingMock.mockReturnValue(false)
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reads HTTP with the requested account after host RPC fails without opening a PTY', async () => {
    const order: string[] = []
    readFileMock.mockResolvedValue(AUTH)
    childSpawnMock.mockImplementation(() => {
      order.push('rpc')
      throw new Error('rpc unavailable')
    })
    vi.mocked(fetch).mockImplementation(async () => {
      order.push('http')
      return backendUsageResponse()
    })

    await expect(
      fetchCodexRateLimits({ codexHomePath: '/inactive/codex-home' })
    ).resolves.toMatchObject({
      status: 'ok',
      session: { usedPercent: 12 },
      weekly: { usedPercent: 34 }
    })
    expect(order).toEqual(['rpc', 'http'])
    expect(readFileMock).toHaveBeenCalledWith(join('/inactive/codex-home', 'auth.json'), 'utf8')
    expect(fetch).toHaveBeenCalledWith(
      'https://chatgpt.com/backend-api/wham/usage',
      expect.objectContaining({
        credentials: 'omit',
        headers: expect.objectContaining({
          Authorization: 'Bearer scoped-token',
          'ChatGPT-Account-Id': 'scoped-account'
        })
      })
    )
    expect(ptySpawnMock).not.toHaveBeenCalled()
  })

  it('preserves the RPC diagnostic when HTTP has no usable data', async () => {
    readFileMock.mockResolvedValue(AUTH)
    childSpawnMock.mockImplementation(() => {
      throw new Error('specific RPC failure')
    })
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }))

    await expect(fetchCodexRateLimits()).resolves.toMatchObject({
      status: 'error',
      error: 'specific RPC failure'
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(ptySpawnMock).not.toHaveBeenCalled()
  })

  it('tries WSL HTTP once before RPC and retains its failure without another HTTP attempt', async () => {
    const order: string[] = []
    readFileMock.mockResolvedValue(AUTH)
    vi.mocked(fetch).mockImplementation(async () => {
      order.push('http')
      return new Response(null, { status: 503 })
    })
    childSpawnMock.mockImplementation(() => {
      order.push('rpc')
      throw new Error('WSL RPC failure')
    })

    await expect(
      fetchCodexRateLimits({ codexHomePath: '\\\\wsl.localhost\\Ubuntu\\home\\alice\\.codex' })
    ).resolves.toMatchObject({ error: 'WSL RPC failure' })
    expect(order).toEqual(['http', 'rpc'])
    expect(ptySpawnMock).not.toHaveBeenCalled()
  })

  it('reads HTTP during backfill without claiming the state database', async () => {
    readFileMock.mockResolvedValue(AUTH)
    backfillPendingMock.mockReturnValue(true)
    vi.mocked(fetch).mockResolvedValue(backendUsageResponse())

    await expect(fetchCodexRateLimits({ codexHomePath: '/backfill/home' })).resolves.toMatchObject({
      status: 'ok',
      session: { usedPercent: 12 }
    })
    expect(backfillRecoveryMock).toHaveBeenCalledWith('/backfill/home')
    expect(childSpawnMock).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(ptySpawnMock).not.toHaveBeenCalled()
  })

  it('preserves cancellation that arrives during HTTP fallback', async () => {
    const controller = new AbortController()
    readFileMock.mockResolvedValue(AUTH)
    childSpawnMock.mockImplementation(() => {
      throw new Error('rpc unavailable')
    })
    vi.mocked(fetch).mockImplementation(async () => {
      controller.abort()
      return backendUsageResponse()
    })

    await expect(fetchCodexRateLimits({ signal: controller.signal })).resolves.toMatchObject({
      status: 'error',
      error: 'Rate-limit fetch aborted'
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(ptySpawnMock).not.toHaveBeenCalled()
  })

  it('uses the official backend usage contract without spawning Codex', async () => {
    readFileMock.mockResolvedValue(
      JSON.stringify({
        tokens: { access_token: 'access-token', account_id: 'account-id' }
      })
    )
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          plan_type: 'plus',
          rate_limit: {
            primary_window: {
              used_percent: 12,
              limit_window_seconds: 3_600,
              reset_at: 1_800_000_000
            },
            secondary_window: {
              used_percent: 34,
              limit_window_seconds: 86_400,
              reset_at: 1_800_100_000
            }
          },
          rate_limit_reset_credits: { available_count: 1 }
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          available_count: 1,
          credits: [
            {
              status: 'available',
              expires_at: '2027-01-15T12:00:00Z',
              granted_at: '2027-01-08T12:00:00Z'
            }
          ]
        })
      } as Response)

    await expect(
      fetchCodexRateLimits({
        codexHomePath: '\\\\wsl.localhost\\Ubuntu\\home\\alice\\.local\\share\\orca\\account\\home'
      })
    ).resolves.toMatchObject({
      session: { usedPercent: 12, windowMinutes: 60, resetsAt: 1_800_000_000_000 },
      weekly: { usedPercent: 34, windowMinutes: 1440, resetsAt: 1_800_100_000_000 },
      rateLimitResetCredits: {
        availableCount: 1,
        nextExpiresAt: Date.parse('2027-01-15T12:00:00Z')
      },
      planType: 'plus',
      status: 'ok'
    })

    expect(childSpawnMock).not.toHaveBeenCalled()
    expect(ptySpawnMock).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://chatgpt.com/backend-api/wham/usage',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer access-token' }),
        signal: expect.any(AbortSignal)
      })
    )
  })

  it('classifies a sole seven-day backend primary window as weekly', async () => {
    readFileMock.mockResolvedValue(
      JSON.stringify({
        tokens: { access_token: 'access-token', account_id: 'account-id' }
      })
    )
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          plan_type: 'plus',
          rate_limit: {
            primary_window: {
              used_percent: 37,
              limit_window_seconds: 7 * 24 * 60 * 60,
              reset_at: 1_800_000_000
            },
            secondary_window: null
          }
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ available_count: 0, credits: [] })
      } as Response)

    await expect(
      fetchCodexRateLimits({
        codexHomePath: '\\\\wsl.localhost\\Ubuntu\\home\\alice\\.local\\share\\orca\\account\\home'
      })
    ).resolves.toMatchObject({
      session: null,
      weekly: { usedPercent: 37, windowMinutes: 10_080, resetsAt: 1_800_000_000_000 },
      status: 'ok'
    })

    expect(childSpawnMock).not.toHaveBeenCalled()
    expect(ptySpawnMock).not.toHaveBeenCalled()
  })

  it('aborts callers while sharing one stalled backend auth read', async () => {
    let resolveRead!: (content: string) => void
    readFileMock.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveRead = resolve
        })
    )
    const firstController = new AbortController()
    const secondController = new AbortController()
    const codexHomePath = '\\\\wsl.localhost\\Ubuntu\\home\\alice\\.codex'

    const first = fetchCodexRateLimits({ codexHomePath, signal: firstController.signal })
    const second = fetchCodexRateLimits({ codexHomePath, signal: secondController.signal })
    await vi.advanceTimersByTimeAsync(0)
    expect(readFileMock).toHaveBeenCalledTimes(1)
    expect(readFileMock).toHaveBeenCalledWith(expect.stringContaining('auth.json'), 'utf8')

    firstController.abort()
    secondController.abort()

    await expect(first).resolves.toMatchObject({
      provider: 'codex',
      status: 'error',
      error: 'Rate-limit fetch aborted'
    })
    await expect(second).resolves.toMatchObject({
      provider: 'codex',
      status: 'error',
      error: 'Rate-limit fetch aborted'
    })
    expect(fetch).not.toHaveBeenCalled()
    expect(childSpawnMock).not.toHaveBeenCalled()
    expect(ptySpawnMock).not.toHaveBeenCalled()
    resolveRead('{}')
    await vi.advanceTimersByTimeAsync(0)
  })

  it('applies the backend deadline while auth reading is still pending', async () => {
    let resolveRead!: (content: string) => void
    readFileMock.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveRead = resolve
        })
    )
    const timeoutController = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(timeoutController.signal)
    const deadlineError = new Error('backend deadline')

    const result = consumeCodexRateLimitResetCredit({
      codexHomePath: '/managed/deadline-home',
      idempotencyKey: 'redeem-timeout'
    })
    await vi.advanceTimersByTimeAsync(0)
    // Why: redeem is user-triggered, so it gets the longer redeem deadline.
    expect(timeout).toHaveBeenCalledWith(30_000)
    expect(readFileMock).toHaveBeenCalledWith(join('/managed/deadline-home', 'auth.json'), 'utf8')

    timeoutController.abort(deadlineError)

    await expect(result).rejects.toBe(deadlineError)
    resolveRead('{}')
    await vi.advanceTimersByTimeAsync(0)
  })

  it('consumes a reset credit with the official payload and bounded request signal', async () => {
    readFileMock.mockResolvedValue(
      JSON.stringify({
        tokens: { access_token: 'access-token', account_id: 'account-id' }
      })
    )
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'already_redeemed' })
    } as Response)

    await expect(
      consumeCodexRateLimitResetCredit({
        codexHomePath: '/managed/codex-home',
        idempotencyKey: 'redeem-123'
      })
    ).resolves.toBe('alreadyRedeemed')

    expect(fetch).toHaveBeenCalledWith(
      'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ redeem_request_id: 'redeem-123' }),
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'ChatGPT-Account-Id': 'account-id',
          'Content-Type': 'application/json'
        })
      })
    )
  })

  it('cancels the unread error-response body so bundled undici cannot crash on socket close', async () => {
    readFileMock.mockResolvedValue(
      JSON.stringify({
        tokens: { access_token: 'access-token', account_id: 'account-id' }
      })
    )
    let cancelledBodies = 0
    vi.mocked(fetch).mockResolvedValue(
      cancelTrackingResponse(429, () => {
        cancelledBodies += 1
      })
    )

    await expect(
      consumeCodexRateLimitResetCredit({
        codexHomePath: '/managed/codex-home',
        idempotencyKey: 'redeem-429'
      })
    ).rejects.toThrow('Codex reset failed: HTTP 429')
    expect(cancelledBodies).toBe(1)
  })
})
