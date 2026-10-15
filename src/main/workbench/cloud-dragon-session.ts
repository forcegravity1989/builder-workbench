import type { Browser, BrowserContext, Page } from 'playwright-core'
import { getAppEnvironment } from '../../shared/app-environment'

/**
 * CloudDragon 无头浏览器会话：一个常驻的本机 Chrome（channel:'chrome'），
 * 依赖内网 SSO 自动登录态。每次操作在共享会话上开独立页面，互不排队；
 * 空闲 5 分钟自动关闭，下次操作重新拉起。常驻的意义是保持 SSO 登录态
 * 是热的（实测：冷读最新包 ~5.7s，热会话 ~2.8s）。
 */
export class PackagePipelineError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'PackagePipelineError'
  }
}

const SSO_TIMEOUT_MS = 90_000
const SSO_POLL_INTERVAL_MS = 500
// 5 分钟空闲覆盖界面每分钟的自动刷新节奏，又不至于永久占用无头 Chrome。
const SESSION_IDLE_CLOSE_MS = 5 * 60_000

export function failureText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

type CloudDragonSession = { browser: Browser; context: BrowserContext }

let session: CloudDragonSession | null = null
let sessionOpening: Promise<CloudDragonSession> | null = null
let idleCloseTimer: ReturnType<typeof setTimeout> | null = null
let activeOperations = 0
let quitHookRegistered = false

function releaseSession(): void {
  if (idleCloseTimer) {
    clearTimeout(idleCloseTimer)
    idleCloseTimer = null
  }
  sessionOpening = null
  const closing = session
  session = null
  if (closing) {
    void closing.browser.close().catch(() => undefined)
  }
}

function scheduleIdleClose(): void {
  if (idleCloseTimer) {
    clearTimeout(idleCloseTimer)
  }
  idleCloseTimer = setTimeout(() => {
    idleCloseTimer = null
    // 超过空闲窗口的长操作由自己的 finally 重新排队，这里只关真正空闲的会话。
    if (activeOperations === 0) {
      releaseSession()
    }
  }, SESSION_IDLE_CLOSE_MS)
  idleCloseTimer.unref()
}

function registerQuitHook(): void {
  if (quitHookRegistered) {
    return
  }
  quitHookRegistered = true
  // 走 AppEnvironment 端口而不是直接 import electron：runtime 的 import 图
  // 必须保持 plain Node 可启动（check-runtime-electron-ratchet 把关），两种
  // 宿主各自把退出清理接到这个端口上。
  getAppEnvironment().onWillQuit(() => releaseSession())
}

async function openSession(): Promise<CloudDragonSession> {
  // Dynamic import keeps playwright-core out of main-process startup until the
  // acceptance screen actually drives CloudDragon.
  const { chromium } = await import('playwright-core')
  let browser: Browser
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
  } catch (error) {
    throw new PackagePipelineError(
      'browser-unavailable',
      `无法启动本机 Chrome（出包依赖系统安装的 Chrome）：${failureText(error)}`
    )
  }
  browser.on('disconnected', () => {
    if (session?.browser === browser) {
      releaseSession()
    }
  })
  try {
    const opened: CloudDragonSession = { browser, context: await browser.newContext() }
    session = opened
    registerQuitHook()
    return opened
  } catch (error) {
    await browser.close().catch(() => undefined)
    throw new PackagePipelineError(
      'browser-unavailable',
      `本机 Chrome 会话初始化失败：${failureText(error)}`
    )
  }
}

async function acquireSession(): Promise<CloudDragonSession> {
  if (session) {
    return session
  }
  sessionOpening ??= openSession().catch((error: unknown) => {
    sessionOpening = null
    throw error
  })
  return sessionOpening
}

async function openCloudDragonPage(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'load' })
  // SSO redirects through login.huawei.com and back automatically; poll the
  // URL instead of a fixed sleep so a fast pass-through returns immediately.
  const deadline = Date.now() + SSO_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (!page.url().includes('login.huawei.com')) {
      return
    }
    await page.waitForTimeout(SSO_POLL_INTERVAL_MS)
  }
  throw new PackagePipelineError('sso-timeout', 'CloudDragon 内网登录跳转超时，请确认本机网络与登录态')
}

/**
 * 在共享会话上开一个新页面跑一次操作：页面之间互不影响也不排队，所以
 * 列表与最新包可以在启动时并行读取；操作结束只关页面，会话留给后续操作。
 */
export async function runOnCloudDragonPage<T>(
  url: string,
  run: (page: Page) => Promise<T>
): Promise<T> {
  const { context } = await acquireSession()
  activeOperations += 1
  scheduleIdleClose()
  try {
    const page = await context.newPage()
    try {
      await openCloudDragonPage(page, url)
      return await run(page)
    } finally {
      await page.close().catch(() => undefined)
    }
  } finally {
    activeOperations -= 1
    scheduleIdleClose()
  }
}
