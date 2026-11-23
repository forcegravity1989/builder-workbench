import { describe, expect, it } from 'vitest'
import type { W3AccountStatus } from '../../shared/w3-account'
import { getW3AccountConfig, type W3AccountConfig } from './w3-account-config'
import {
  W3AccountService,
  type W3FetchResponse,
  type W3LoginWindowHandle
} from './w3-account-service'

type Entry = { fn: () => void; ms: number; cleared: boolean }
type FetchResult = W3FetchResponse | Error

const CONFIG: W3AccountConfig = getW3AccountConfig({}) as W3AccountConfig

function ok(body: unknown, url = 'https://w3.huawei.com/next/service/rest/my/w3account/v1/account/zh'): W3FetchResponse {
  return {
    status: 200,
    url,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
  }
}
function status(status: number, body = ''): W3FetchResponse {
  return { status, url: 'https://w3.huawei.com/api', text: async () => body }
}
const NOT_LOGGED_IN = (): W3FetchResponse => status(421, 'No login user found.')
const VALID = { employeeNumber: '111222', uid: 'u1', displayName: ['cn=张三', 'en=zhangsan'] }

function makeDeps(overrides: Partial<{ fetchResults: FetchResult[]; now: () => number }> = {}) {
  const fetchResults: FetchResult[] = overrides.fetchResults ?? []
  const fetchState = {
    count: 0,
    lastPartition: '',
    lastUrl: '',
    lastInit: null as Record<string, unknown> | null,
    fetch: async (partition: string, url: string, init: Record<string, unknown>) => {
      fetchState.lastPartition = partition
      fetchState.lastUrl = url
      fetchState.lastInit = init
      const next = fetchResults[Math.min(fetchState.count, fetchResults.length - 1)]
      fetchState.count += 1
      if (next instanceof Error) {
        throw next
      }
      return next
    }
  }
  type TestWindow = W3LoginWindowHandle & { closed: boolean; closeCount: number }
  const windows: TestWindow[] = []
  const openLoginWindow = (): TestWindow => {
    const window: TestWindow = {
      closed: false,
      closeCount: 0,
      isWindowClosed: () => window.closed,
      closeWindow: () => {
        window.closeCount += 1
        window.closed = true
      }
    }
    windows.push(window)
    return window
  }
  const entries: Entry[] = []
  const scheduler = {
    entries,
    setTimer: (fn: () => void, ms: number): Entry => {
      const entry = { fn, ms, cleared: false }
      entries.push(entry)
      return entry
    },
    clearTimer: (handle: unknown): void => {
      ;(handle as Entry).cleared = true
    },
    pendingCount: () => entries.filter((entry) => !entry.cleared).length,
    // Run every scheduled (not cleared) timer once, draining microtasks after
    // each so the async tick body completes before the next timer fires.
    flush: async (): Promise<void> => {
      let count = 0
      for (const entry of entries) {
        if (entry.cleared) {
          continue
        }
        entry.cleared = true
        entry.fn()
        count += 1
        for (let i = 0; i < 6; i += 1) {
          await Promise.resolve()
        }
        if (count > 50) {
          break
        }
      }
    }
  }
  const broadcastState: W3AccountStatus[] = []
  const clearStorage: string[] = []
  const service = new W3AccountService({
    getConfig: () => CONFIG,
    getActiveProfileId: () => 'orca-1',
    ensureSessionProfile: async () => ({ profileId: 'w3-sess-1', partition: 'persist:w3-sess-1' }),
    fetch: fetchState.fetch,
    clearDedicatedStorage: async (partition) => {
      clearStorage.push(partition)
    },
    openLoginWindow,
    broadcast: (s) => {
      broadcastState.push(s)
    },
    now: overrides.now,
    scheduler,
    intervalMs: 2_000,
    fetchTimeoutMs: 8_000
  })
  return {
    service,
    scheduler,
    openLoginWindow,
    windows,
    fetchState,
    broadcastState,
    clearStorage,
    last: () => broadcastState.at(-1) ?? null
  }
}

describe('W3AccountService (web login + account API)', () => {
  it('reports unconfigured when config is invalid', async () => {
    const h = makeDeps()
    const broken = new W3AccountService({
      getConfig: () => ({ configured: false, reason: 'invalid' }),
      getActiveProfileId: () => 'p',
      ensureSessionProfile: async () => ({ profileId: 'x', partition: 'p:x' }),
      fetch: h.fetchState.fetch,
      clearDedicatedStorage: async () => {},
      openLoginWindow: () => {
        throw new Error('must not open')
      },
      broadcast: () => {}
    })
    expect(await broken.getStatus()).toEqual({ state: 'unconfigured' })
    expect((await broken.startLogin()).status).toEqual({ state: 'unconfigured' })
  })

  it('421 keeps waiting; 200 with valid identity signs in and closes the window', async () => {
    const h = makeDeps({ fetchResults: [NOT_LOGGED_IN(), NOT_LOGGED_IN(), ok(VALID)] })
    const started = await h.service.startLogin()
    expect(started.status).toEqual({ state: 'login-pending', sessionProfileId: 'w3-sess-1' })

    await h.scheduler.flush()
    // Why: the poll must use the dedicated partition with credentials included.
    expect(h.fetchState.lastPartition).toBe('persist:w3-sess-1')
    expect(h.fetchState.lastUrl).toBe(CONFIG.accountApiUrl)
    expect(h.fetchState.lastInit).toMatchObject({ redirect: 'manual', credentials: 'include' })
    expect(h.last()).toEqual({
      state: 'signed-in',
      sessionProfileId: 'w3-sess-1',
      identity: { displayName: '张三', employeeNo: '111222' }
    })
    expect(h.windows[0].closeCount).toBe(1)
    expect(h.scheduler.pendingCount()).toBe(0)
  })

  it('200 without identifying fields fails with account-parse-failed', async () => {
    const h = makeDeps({ fetchResults: [ok({ profile: 1 })] })
    await h.service.startLogin()
    await h.scheduler.flush()
    expect(h.last()).toEqual({ state: 'failed', reason: 'account-parse-failed' })
    expect(h.windows[0].closeCount).toBe(1)
  })

  it('5xx fails with login-failed', async () => {
    const h = makeDeps({ fetchResults: [status(500, 'oops')] })
    await h.service.startLogin()
    await h.scheduler.flush()
    expect(h.last()).toEqual({ state: 'failed', reason: 'login-failed' })
    expect(h.windows[0].closeCount).toBe(1)
  })

  it('a redirect to another origin is treated as login-failed', async () => {
    const h = makeDeps({ fetchResults: [ok(VALID, 'https://evil.example/steal')] })
    await h.service.startLogin()
    await h.scheduler.flush()
    expect(h.last()).toEqual({ state: 'failed', reason: 'login-failed' })
  })

  it('a network error is transient (keeps waiting until the API answers)', async () => {
    const h = makeDeps({ fetchResults: [new Error('net'), ok(VALID)] })
    await h.service.startLogin()
    await h.scheduler.flush()
    expect(h.last()).toEqual({
      state: 'signed-in',
      sessionProfileId: 'w3-sess-1',
      identity: { displayName: '张三', employeeNo: '111222' }
    })
  })

  it('times out at the configured total wait and closes the window', async () => {
    let clock = 0
    const now = (): number => (clock += 1_000)
    const h = makeDeps({ fetchResults: [NOT_LOGGED_IN()], now })
    // Bound the wait for the test: the service reads timeoutMs from config.
    const fast = Object.assign({}, CONFIG, { loginTimeoutMs: 3_000 })
    const fastService = new W3AccountService({
      getConfig: () => fast,
      getActiveProfileId: () => 'orca-1',
      ensureSessionProfile: async () => ({ profileId: 'w3-sess-1', partition: 'persist:w3-sess-1' }),
      fetch: h.fetchState.fetch,
      clearDedicatedStorage: async () => {},
      openLoginWindow: h.openLoginWindow,
      broadcast: (s) => h.broadcastState.push(s),
      now,
      scheduler: h.scheduler,
      intervalMs: 2_000
    })
    await fastService.startLogin()
    await h.scheduler.flush()
    expect(h.last()).toEqual({ state: 'failed', reason: 'timeout' })
    expect(h.windows[0].closeCount).toBe(1)
    expect(h.scheduler.pendingCount()).toBe(0)
  })

  it('cancel cleans up the window and timers without broadcasting a result', async () => {
    const h = makeDeps({ fetchResults: [NOT_LOGGED_IN()] })
    await h.service.startLogin()
    const before = h.broadcastState.length
    const status = await h.service.cancelLogin()
    expect(status).toEqual({ state: 'signed-out' })
    expect(h.windows[0].closeCount).toBe(1)
    expect(h.scheduler.pendingCount()).toBe(0)
    expect(h.broadcastState.length).toBe(before) // cancel itself does not broadcast
    // A late timer firing cannot resurrect the poller.
    await h.scheduler.flush()
    expect(h.last()?.state).not.toBe('signed-in')
  })

  it('a user-closed login window reports cancelled', async () => {
    const h = makeDeps({ fetchResults: [NOT_LOGGED_IN()] })
    await h.service.startLogin()
    h.windows[0].closed = true
    await h.scheduler.flush()
    expect(h.last()).toEqual({ state: 'failed', reason: 'cancelled' })
  })

  it('signOut clears only the dedicated partition and returns signed-out', async () => {
    const h = makeDeps({ fetchResults: [ok(VALID)] })
    await h.service.startLogin()
    await h.scheduler.flush()
    expect(h.last()?.state).toBe('signed-in')
    const status = await h.service.signOut()
    expect(status).toEqual({ state: 'signed-out' })
    expect(h.clearStorage).toEqual(['persist:w3-sess-1'])
  })

  it('getStatus restores a live session (200) and reports signed-out on 421', async () => {
    const h = makeDeps({ fetchResults: [ok(VALID), NOT_LOGGED_IN()] })
    expect(await h.service.getStatus()).toEqual({
      state: 'signed-in',
      sessionProfileId: 'w3-sess-1',
      identity: { displayName: '张三', employeeNo: '111222' }
    })
    expect(await h.service.getStatus()).toEqual({ state: 'signed-out' })
  })

  it('a superseded startLogin cannot overwrite a newer poller', async () => {
    const h = makeDeps({ fetchResults: [NOT_LOGGED_IN(), ok(VALID)] })
    const first = h.service.startLogin()
    // Cancel while the first call is still in flight, then start a new login.
    await h.service.cancelLogin()
    const second = await h.service.startLogin()
    expect((await first).status).toEqual({ state: 'signed-out' })
    expect(second.status).toEqual({ state: 'login-pending', sessionProfileId: 'w3-sess-1' })
    await h.scheduler.flush()
    // Only the surviving (second) poller acts: 421 then VALID → signed-in.
    expect(h.last()).toEqual({
      state: 'signed-in',
      sessionProfileId: 'w3-sess-1',
      identity: { displayName: '张三', employeeNo: '111222' }
    })
  })

  it('shortcut opens the default W3 home and rejects non-whitelist hosts', async () => {
    const h = makeDeps({ fetchResults: [ok(VALID), ok(VALID)] })
    // No url → configured W3 home, same dedicated partition.
    expect(await h.service.resolveOpenWebTarget()).toEqual({
      ok: true,
      partition: 'persist:w3-sess-1',
      url: 'https://w3.huawei.com/next/index_zh.html'
    })
    // Any non-trusted host is refused even when signed in.
    expect(await h.service.resolveOpenWebTarget('https://evil.example/x')).toEqual({
      ok: false,
      reason: 'invalid-url'
    })
  })

  it('shortcut is refused when not signed in', async () => {
    const h = makeDeps({ fetchResults: [NOT_LOGGED_IN()] })
    expect(await h.service.resolveOpenWebTarget()).toEqual({
      ok: false,
      reason: 'not-signed-in'
    })
  })

  it('startLogin short-circuits to signed-in when already signed in (no 2nd window)', async () => {
    const h = makeDeps({ fetchResults: [ok(VALID)] })
    // Populate the confirmed-signed-in cache via a status check first.
    expect((await h.service.getStatus()).state).toBe('signed-in')
    const result = await h.service.startLogin()
    expect(result.status).toEqual({
      state: 'signed-in',
      sessionProfileId: 'w3-sess-1',
      identity: { displayName: '张三', employeeNo: '111222' }
    })
    // Why: a login window must NOT be opened when already signed in.
    expect(h.windows.length).toBe(0)
  })
})
