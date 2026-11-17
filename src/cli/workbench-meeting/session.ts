import { join } from 'node:path'
import { getDefaultUserDataPath } from '../runtime/metadata'
import { RuntimeClientError } from '../runtime/types'
import {
  W3_ORIGIN,
  fetchMeetingDetail,
  isMeetingLoginRequired,
  meetingSummaryUrl,
  type MeetingDetail
} from './api'

/**
 * Why a Workbench-owned profile: Chromium takes an exclusive lock on the cookie
 * DB of a running profile, and Chrome 136+ refuses a debugging port on the
 * default profile — so no process can read or drive the Chrome the user is
 * browsing in. Playwright works around it the same way: it launches Chrome with
 * a user-data-dir it owns, opens the page, and reads the cookies that page got.
 * The profile also keeps SSO device cookies, which is what lets the headless
 * attempt authenticate without any window on an already signed-in machine.
 */
const PROFILE_DIR_NAME = 'emeeting-chrome-profile'
const SILENT_LOGIN_TIMEOUT_MS = 20_000
const INTERACTIVE_LOGIN_TIMEOUT_MS = 5 * 60_000
const POLL_INTERVAL_MS = 1_500

export type MeetingCookie = {
  name: string
  value: string
  domain: string
  expires: number
}

type MeetingBrowserPage = {
  goto(
    url: string,
    options?: { waitUntil?: 'domcontentloaded'; timeout?: number }
  ): Promise<unknown>
}

export type MeetingBrowserContext = {
  cookies(url?: string): Promise<MeetingCookie[]>
  pages(): MeetingBrowserPage[]
  newPage(): Promise<MeetingBrowserPage>
  close(): Promise<void>
  on(event: 'close', listener: () => void): void
}

export type LaunchMeetingBrowser = (headless: boolean) => Promise<MeetingBrowserContext>

export type VerifyMeetingSession = (cookie: string, meetingId: string) => Promise<MeetingDetail>

export type MeetingSession = { cookie: string; detail: MeetingDetail }

export function meetingBrowserProfileDir(): string {
  return join(getDefaultUserDataPath(), PROFILE_DIR_NAME)
}

/** Cookie domain match per RFC 6265: exact host or a parent domain. */
export function cookieMatchesHost(hostKey: string, host: string): boolean {
  const domain = hostKey.replace(/^\./, '').toLowerCase()
  const target = host.toLowerCase()
  return domain.length > 0 && (target === domain || target.endsWith(`.${domain}`))
}

/** Build the request Cookie header; expired rows and duplicates of the same name are dropped. */
export function cookieHeaderFromCookies(
  cookies: MeetingCookie[],
  host: string,
  nowUnix: number
): string {
  const values = new Map<string, string>()
  for (const cookie of cookies) {
    if (!cookie.name || !cookieMatchesHost(cookie.domain, host)) {
      continue
    }
    if (cookie.expires > 0 && cookie.expires <= nowUnix) {
      continue
    }
    values.set(cookie.name, cookie.value)
  }
  return Array.from(values, ([name, value]) => `${name}=${value}`).join('; ')
}

function launchError(error: unknown): RuntimeClientError {
  const message = error instanceof Error ? error.message : String(error)
  if (/is not found|Executable doesn't exist|no such file/i.test(message)) {
    return new RuntimeClientError(
      'chrome-not-found',
      '未找到系统 Chrome，无法打开 eMeeting 登录窗口。请安装 Google Chrome 后重试。'
    )
  }
  if (/ProcessSingleton|SingletonLock|profile.*(?:lock|in use)|already in use/i.test(message)) {
    return new RuntimeClientError(
      'meeting-browser-profile-busy',
      '会议专用 Chrome 配置正被占用（上次打开后未关闭），请关闭该 Chrome 窗口后重试。'
    )
  }
  return new RuntimeClientError(
    'meeting-browser-launch-failed',
    `无法启动系统 Chrome：${message.split('\n')[0]}`
  )
}

const launchSystemChrome: LaunchMeetingBrowser = async (headless) => {
  const { chromium } = await import('playwright-core')
  try {
    return (await chromium.launchPersistentContext(meetingBrowserProfileDir(), {
      channel: 'chrome',
      headless,
      viewport: null,
      args: ['--no-first-run', '--no-default-browser-check']
    })) as unknown as MeetingBrowserContext
  } catch (error) {
    throw launchError(error)
  }
}

async function closeQuietly(context: MeetingBrowserContext): Promise<void> {
  try {
    await context.close()
  } catch {
    // A window the user already closed needs no cleanup.
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Authorized when the meeting detail API accepts the profile's cookies. */
async function authorizedSession(
  context: MeetingBrowserContext,
  meetingId: string,
  verifySession: VerifyMeetingSession
): Promise<MeetingSession | null> {
  const header = cookieHeaderFromCookies(
    await context.cookies(),
    new URL(W3_ORIGIN).hostname,
    Math.floor(Date.now() / 1000)
  )
  if (!header) {
    return null
  }
  try {
    return { cookie: header, detail: await verifySession(header, meetingId) }
  } catch (error) {
    if (isMeetingLoginRequired(error)) {
      return null
    }
    throw error
  }
}

type LoginAttempt = {
  timeoutMs: number
  pollIntervalMs: number
  stopWhen: () => boolean
}

/** Navigate to the meeting page, then poll until the detail API accepts the page's cookies. */
async function attemptSession(
  context: MeetingBrowserContext,
  meetingId: string,
  verifySession: VerifyMeetingSession,
  attempt: LoginAttempt
): Promise<MeetingSession | null> {
  const page = context.pages()[0] ?? (await context.newPage())
  try {
    await page.goto(meetingSummaryUrl(meetingId), {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    })
  } catch {
    // Why: the poll below is the readiness signal; a navigation that dies with the
    // window is reported by stopWhen, and a dead network by the timeout.
  }

  const deadline = Date.now() + attempt.timeoutMs
  while (Date.now() < deadline) {
    if (attempt.stopWhen()) {
      return null
    }
    const session = await authorizedSession(context, meetingId, verifySession)
    if (session) {
      return session
    }
    await delay(attempt.pollIntervalMs)
  }
  return null
}

async function interactiveLogin(
  meetingId: string,
  launch: LaunchMeetingBrowser,
  verifySession: VerifyMeetingSession,
  loginTimeoutMs: number,
  pollIntervalMs: number
): Promise<MeetingSession> {
  console.error(
    '企业 SSO 自动登录未完成：已用本机 Chrome 打开登录窗口，请在窗口内完成登录，完成后会自动继续（不影响你正在使用的 Chrome）。'
  )
  const context = await launch(false)
  let closing = false
  let closedByUser = false
  context.on('close', () => {
    if (!closing) {
      closedByUser = true
    }
  })

  try {
    const session = await attemptSession(context, meetingId, verifySession, {
      timeoutMs: loginTimeoutMs,
      pollIntervalMs,
      stopWhen: () => closedByUser
    })
    if (session) {
      return session
    }
    throw new RuntimeClientError(
      'meeting-login-required',
      closedByUser
        ? '登录窗口已关闭，尚未取得 eMeeting 登录态。重新运行命令可再次打开登录窗口。'
        : `等待 eMeeting 登录超时（${Math.round(loginTimeoutMs / 60_000)} 分钟），请重新运行命令后完成登录。`
    )
  } finally {
    closing = true
    await closeQuietly(context)
  }
}

/**
 * Resolve a usable eMeeting session. The first attempt is headless: the meeting
 * page's SSO redirect usually authenticates by itself within seconds, so the
 * common case opens no window at all. Only when that stalls does the login
 * window appear for manual input.
 */
export async function resolveMeetingSession(
  meetingId: string,
  options: {
    launch?: LaunchMeetingBrowser
    verifySession?: VerifyMeetingSession
    silentLoginTimeoutMs?: number
    loginTimeoutMs?: number
    pollIntervalMs?: number
  } = {}
): Promise<MeetingSession> {
  const launch = options.launch ?? launchSystemChrome
  const verifySession = options.verifySession ?? fetchMeetingDetail
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS

  const silentContext = await launch(true)
  try {
    const session = await attemptSession(silentContext, meetingId, verifySession, {
      timeoutMs: options.silentLoginTimeoutMs ?? SILENT_LOGIN_TIMEOUT_MS,
      pollIntervalMs,
      stopWhen: () => false
    })
    if (session) {
      return session
    }
  } finally {
    await closeQuietly(silentContext)
  }

  return await interactiveLogin(
    meetingId,
    launch,
    verifySession,
    options.loginTimeoutMs ?? INTERACTIVE_LOGIN_TIMEOUT_MS,
    pollIntervalMs
  )
}
