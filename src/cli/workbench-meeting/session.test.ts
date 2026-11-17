import { afterEach, describe, expect, it, vi } from 'vitest'
import { RuntimeClientError } from '../runtime/types'
import type { MeetingDetail } from './api'
import {
  cookieHeaderFromCookies,
  cookieMatchesHost,
  launchError,
  resolveMeetingSession,
  type LaunchMeetingBrowser,
  type MeetingBrowserContext,
  type MeetingCookie
} from './session'

afterEach(() => {
  vi.restoreAllMocks()
})

const NOW = 1_800_000_000
const DETAIL: MeetingDetail = {
  subject: 'v1.0.46 版本验收会议',
  startTime: 1,
  endTime: 2,
  topics: []
}

function cookie(overrides: Partial<MeetingCookie> = {}): MeetingCookie {
  return {
    name: 'sid',
    value: 'abc',
    domain: '.huawei.com',
    expires: NOW + 3600,
    ...overrides
  }
}

type FakeContext = MeetingBrowserContext & { emitClose: () => void; closed: boolean }

function fakeContext(cookies: MeetingCookie[]): FakeContext {
  const listeners: (() => void)[] = []
  const page = { goto: async () => undefined }
  const context: FakeContext = {
    closed: false,
    cookies: async () => cookies,
    pages: () => [page],
    newPage: async () => page,
    close: async () => {
      context.closed = true
      listeners.forEach((listener) => listener())
    },
    on: (_event, listener) => {
      listeners.push(listener)
    },
    emitClose: () => listeners.forEach((listener) => listener())
  }
  return context
}

function recorder(contexts: FakeContext[]): { launch: LaunchMeetingBrowser; headless: boolean[] } {
  const headless: boolean[] = []
  return {
    headless,
    launch: async (flag) => {
      headless.push(flag)
      const context = contexts[headless.length - 1]
      if (!context) {
        throw new Error('unexpected launch')
      }
      return context
    }
  }
}

describe('meeting session cookies', () => {
  it('matches the exact host and parent domains only', () => {
    expect(cookieMatchesHost('.huawei.com', 'w3.huawei.com')).toBe(true)
    expect(cookieMatchesHost('w3.huawei.com', 'w3.huawei.com')).toBe(true)
    expect(cookieMatchesHost('.huawei.com', 'huawei.com')).toBe(true)
    expect(cookieMatchesHost('.huawei.com', 'not-huawei.com')).toBe(false)
    expect(cookieMatchesHost('.w3.huawei.com', 'huawei.com')).toBe(false)
  })

  it('keeps the most path-specific cookie for a duplicated name', () => {
    expect(
      cookieHeaderFromCookies(
        [
          cookie({ name: 'sid', value: 'root', path: '/' }),
          cookie({ name: 'sid', value: 'emeeting', path: '/emeeting' })
        ],
        'w3.huawei.com',
        NOW
      )
    ).toBe('sid=emeeting')
  })

  it('builds a header without expired, duplicate or foreign cookies', () => {
    expect(
      cookieHeaderFromCookies(
        [
          cookie({ name: 'a', value: '1' }),
          cookie({ name: 'b', value: 'old', expires: NOW - 1 }),
          cookie({ name: 'a', value: '2', domain: 'w3.huawei.com' }),
          cookie({ name: 'c', value: 'other', domain: '.example.com' }),
          cookie({ name: 'd', value: 'session', expires: -1 })
        ],
        'w3.huawei.com',
        NOW
      )
    ).toBe('a=2; d=session')
  })
})

describe('launchError', () => {
  it('tells a locked profile apart from a launch crash', () => {
    const playwrightError = new Error(
      'browserType.launchPersistentContext: Target page, context or browser has been closed'
    )
    expect(launchError(playwrightError, true).code).toBe('meeting-browser-profile-busy')
    expect(launchError(playwrightError, false).code).toBe('meeting-browser-launch-failed')
  })

  it('maps a missing browser runtime and missing Chrome separately', () => {
    expect(launchError(new Error("Cannot find module 'playwright-core'"), false).code).toBe(
      'meeting-browser-launch-failed'
    )
    expect(
      launchError(new Error('browserType.launchPersistentContext: is not found'), false).code
    ).toBe('chrome-not-found')
  })
})

describe('resolveMeetingSession', () => {
  it('reuses the saved profile without opening a window', async () => {
    const cached = fakeContext([cookie()])
    const { launch, headless } = recorder([cached])
    const verify = vi.fn(async () => DETAIL)

    await expect(
      resolveMeetingSession('A'.repeat(32), { launch, verifySession: verify })
    ).resolves.toEqual({ cookie: 'sid=abc', detail: DETAIL })
    expect(headless).toEqual([true])
    expect(cached.closed).toBe(true)
  })

  it('falls back to a visible window when the silent attempt is not authorized', async () => {
    const cached = fakeContext([cookie()])
    const visible = fakeContext([cookie({ value: 'fresh' })])
    const { launch, headless } = recorder([cached, visible])
    const error = new RuntimeClientError('meeting-login-required', '登录态已失效')
    const verify = vi
      .fn<(cookie: string, meetingId: string) => Promise<MeetingDetail>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValue(DETAIL)
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      resolveMeetingSession('A'.repeat(32), {
        launch,
        verifySession: verify,
        silentLoginTimeoutMs: 1,
        pollIntervalMs: 1
      })
    ).resolves.toEqual({ cookie: 'sid=fresh', detail: DETAIL })
    expect(headless).toEqual([true, false])
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('falls back to the visible window when headless Chrome died', async () => {
    const crashed: FakeContext = {
      ...fakeContext([cookie()]),
      cookies: async () => {
        throw new Error('Target page, context or browser has been closed')
      }
    }
    const visible = fakeContext([cookie({ value: 'fresh' })])
    const { launch, headless } = recorder([crashed, visible])
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      resolveMeetingSession('A'.repeat(32), {
        launch,
        verifySession: async () => DETAIL,
        silentLoginTimeoutMs: 1,
        pollIntervalMs: 1
      })
    ).resolves.toEqual({ cookie: 'sid=fresh', detail: DETAIL })
    expect(headless).toEqual([true, false])
  })

  it('reports a window closed mid-poll as a login failure, not a crash', async () => {
    const visible: FakeContext = {
      ...fakeContext([cookie()]),
      cookies: async () => {
        throw new Error('Target page, context or browser has been closed')
      }
    }
    const { launch } = recorder([fakeContext([]), visible])
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      resolveMeetingSession('A'.repeat(32), {
        launch,
        verifySession: async () => DETAIL,
        silentLoginTimeoutMs: 1,
        loginTimeoutMs: 10,
        pollIntervalMs: 1
      })
    ).rejects.toMatchObject({
      code: 'meeting-login-required',
      message: expect.stringContaining('登录窗口已关闭')
    })
  })

  it('fails with meeting-login-required when the login window is closed', async () => {
    const cached = fakeContext([])
    const visible = fakeContext([])
    // Why a timer: the close listener is only registered once the window launches.
    const launch: LaunchMeetingBrowser = async (headless) => {
      if (headless) {
        return cached
      }
      setTimeout(() => visible.emitClose(), 0)
      return visible
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      resolveMeetingSession('A'.repeat(32), {
        launch,
        verifySession: async () => DETAIL,
        silentLoginTimeoutMs: 1,
        pollIntervalMs: 1
      })
    ).rejects.toMatchObject({
      code: 'meeting-login-required',
      message: expect.stringContaining('登录窗口已关闭')
    })
  })

  it('times out while waiting for login', async () => {
    const { launch } = recorder([fakeContext([]), fakeContext([])])
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      resolveMeetingSession('A'.repeat(32), {
        launch,
        verifySession: async () => DETAIL,
        silentLoginTimeoutMs: 1,
        loginTimeoutMs: 10,
        pollIntervalMs: 1
      })
    ).rejects.toMatchObject({
      code: 'meeting-login-required',
      message: expect.stringContaining('超时')
    })
  })
})
