// Why: the W3 session bridge needs a passwordless SSO session that Electron
// cannot produce itself — XGate/SPES verifies the browser engine server-side
// (issue #728), so the built-in browser can never complete SPES login. A
// controlled, temporary-profile headless system Chrome CAN: enterprise policy
// forces the SPES extension into every profile, so a throwaway profile logs in
// with zero user action and without touching the user's running browser
// (no singleton lock, no debug-port contention, no profile copy).
// This module launches that Chrome, drives it over the DevTools protocol,
// harvests the plaintext huawei.com-family cookies (Chrome decrypts them
// itself, bypassing the on-disk library lock and App-Bound Encryption), and
// tears everything down. All IO is injected so the orchestration is testable.

import { join } from 'node:path'
import type { W3BridgeCookie } from './w3-session-bridge'

export type W3SessionSourceFailure =
  | 'chrome-not-found'
  | 'launch-failed'
  | 'debug-port-timeout'
  | 'sso-failed'
  | 'cookie-read-failed'
  | 'aborted'

export type W3SessionSourceResult =
  | { ok: true; cookies: W3BridgeCookie[] }
  | { ok: false; reason: W3SessionSourceFailure }

/** Minimal CDP-over-WebSocket surface; the real binding wraps the global WebSocket. */
export type W3CdpSocket = {
  send(data: string): void
  close(): void
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: (() => void) | null
  onerror: (() => void) | null
}

export type W3ChromeProcess = {
  kill(): void
  /**
   * True once the spawn itself failed asynchronously (ENOENT etc.). Without
   * this check a bad override path would only surface as a debug-port timeout.
   */
  hasSpawnError?: () => boolean
}

export type W3ChromeSourceDeps = {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  /** Launch Chrome with the given args; returns a handle whose kill() stops it. */
  spawnChrome: (chromePath: string, args: string[]) => W3ChromeProcess
  /** Probe a candidate Chrome path; the first existing candidate wins. */
  fileExists: (path: string) => boolean
  mkdtemp: (prefix: string) => Promise<string>
  readFileText: (path: string) => Promise<string>
  removeDir: (path: string) => Promise<void>
  fetchJson: (url: string) => Promise<unknown>
  /** Resolve only once the socket is OPEN — a CONNECTING socket cannot send. */
  connectWebSocket: (url: string, signal?: AbortSignal) => Promise<W3CdpSocket>
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>
  now: () => number
  signal?: AbortSignal
}

export const W3_SOURCE_WARMUP_MS = 6000
export const W3_SOURCE_NAV_POLL_MS = 1000
export const W3_SOURCE_NAV_STABLE_ROUNDS = 5
export const W3_SOURCE_NAV_TIMEOUT_MS = 45_000
export const W3_SOURCE_PORT_TIMEOUT_MS = 15_000
export const W3_SOURCE_CDP_TIMEOUT_MS = 15_000

/** The page the controlled Chrome drives to trigger the W3 SSO redirect chain. */
export const W3_SOURCE_SSO_TARGET = 'https://w3.huawei.com/'
/** Landing back on the W3 host (not the login page) means SPES completed. */
const W3_LOGIN_PAGE_MARKER = 'login.huawei.com/login1'

export function findSystemChromePath(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  fileExists: (path: string) => boolean
): string | null {
  const override =
    typeof env.ORCA_W3_SYSTEM_CHROME_PATH === 'string' ? env.ORCA_W3_SYSTEM_CHROME_PATH.trim() : ''
  // Why validate the override: a typo'd path must report chrome-not-found,
  // not crash the main process on an async spawn ENOENT.
  if (override) {
    return fileExists(override) ? override : null
  }
  const home = typeof env.HOME === 'string' ? env.HOME : ''
  let candidates: string[] = []
  if (platform === 'win32') {
    const programFiles = env.ProgramFiles ?? 'C:\\Program Files'
    const programFilesX86 = env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
    const localAppData = env.LOCALAPPDATA ?? ''
    candidates = [
      join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ...(localAppData ? [join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe')] : [])
    ]
  } else if (platform === 'darwin') {
    candidates = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    if (home) {
      candidates.push(`${home}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`)
    }
  }
  return candidates.find((candidate) => fileExists(candidate)) ?? null
}

type CdpClient = {
  send: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>
  close: () => void
}

function cdpClientFrom(socket: W3CdpSocket): CdpClient {
  let nextId = 0
  const pending = new Map<number, (message: Record<string, unknown>) => void>()
  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(String(event.data)) as Record<string, unknown>
      const id = typeof message.id === 'number' ? message.id : null
      if (id !== null && pending.has(id)) {
        pending.get(id)?.(message)
        pending.delete(id)
      }
    } catch {
      // A malformed frame must not kill the whole session harvest.
    }
  }
  return {
    send: (method, params = {}) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const id = ++nextId
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error(`cdp timeout: ${method}`))
        }, W3_SOURCE_CDP_TIMEOUT_MS)
        pending.set(id, (message) => {
          clearTimeout(timer)
          if (message.error) {
            reject(new Error(`cdp error: ${JSON.stringify(message.error)}`))
          } else {
            resolve(message.result as Record<string, unknown>)
          }
        })
        socket.send(JSON.stringify({ id, method, params }))
      }),
    close: () => {
      socket.close()
    }
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException('aborted', 'AbortError')
  }
}

async function waitForDebugPort(
  deps: W3ChromeSourceDeps,
  userDataDir: string,
  process_: W3ChromeProcess
): Promise<number> {
  const deadline = deps.now() + W3_SOURCE_PORT_TIMEOUT_MS
  const portFile = join(userDataDir, 'DevToolsActivePort')
  while (deps.now() < deadline) {
    throwIfAborted(deps.signal)
    // Why surface spawn errors here: an async ENOENT would otherwise only
    // surface as a misleading debug-port timeout 15s later.
    if (process_.hasSpawnError?.()) {
      throw new Error('launch-failed')
    }
    try {
      const raw = await deps.readFileText(portFile)
      const port = Number(raw.trim().split('\n')[0])
      if (Number.isInteger(port) && port > 0) {
        return port
      }
    } catch {
      // Not written yet — keep waiting.
    }
    await deps.sleep(250, deps.signal)
  }
  throw new Error('debug-port-timeout')
}

async function findPageTargetWebSocketUrl(deps: W3ChromeSourceDeps, port: number): Promise<string> {
  const deadline = deps.now() + W3_SOURCE_PORT_TIMEOUT_MS
  while (deps.now() < deadline) {
    throwIfAborted(deps.signal)
    try {
      const targets = (await deps.fetchJson(`http://127.0.0.1:${port}/json/list`)) as
        | { type?: string; webSocketDebuggerUrl?: string }[]
        | null
      const page = targets?.find((target) => target.type === 'page' && target.webSocketDebuggerUrl)
      if (page?.webSocketDebuggerUrl) {
        return page.webSocketDebuggerUrl
      }
    } catch {
      // The port file exists before the HTTP endpoint accepts connections —
      // a refused request here is a normal startup race, keep waiting.
    }
    await deps.sleep(250, deps.signal)
  }
  throw new Error('debug-port-timeout')
}

/**
 * Navigate to the W3 home and wait until the redirect chain settles. SPES
 * passwordless login bounces through login.huawei.com and back; landing on
 * the login page (and staying there) means SSO did not complete.
 */
async function navigateUntilSettled(
  deps: W3ChromeSourceDeps,
  client: CdpClient
): Promise<{ ok: boolean; finalUrl: string }> {
  await client.send('Page.enable')
  await client.send('Network.enable')
  // Why a fixed warmup: enterprise-policy extensions install into the fresh
  // profile on first launch; navigating before the SPES extension is up lands
  // on the login page for good.
  await deps.sleep(W3_SOURCE_WARMUP_MS, deps.signal)
  throwIfAborted(deps.signal)
  await client.send('Page.navigate', { url: W3_SOURCE_SSO_TARGET })
  const deadline = deps.now() + W3_SOURCE_NAV_TIMEOUT_MS
  let lastUrl = ''
  let stable = 0
  let finalUrl = ''
  while (deps.now() < deadline) {
    await deps.sleep(W3_SOURCE_NAV_POLL_MS, deps.signal)
    throwIfAborted(deps.signal)
    let url = ''
    try {
      const evaluated = (await client.send('Runtime.evaluate', {
        expression: 'location.href',
        returnByValue: true
      })) as { result?: { value?: unknown } }
      url = typeof evaluated.result?.value === 'string' ? evaluated.result.value : ''
    } catch {
      // Why swallow: every hop of the SPES redirect chain destroys the
      // execution context, and the evaluate lands exactly in that window.
      // Treat it as "not settled yet" — the 45s deadline still bounds us.
    }
    if (url) {
      finalUrl = url
      if (url === lastUrl) {
        stable += 1
      } else {
        stable = 0
        lastUrl = url
      }
      if (stable >= W3_SOURCE_NAV_STABLE_ROUNDS) {
        break
      }
    }
  }
  const settledOnLoginPage = finalUrl.includes(W3_LOGIN_PAGE_MARKER)
  return { ok: Boolean(finalUrl) && !settledOnLoginPage, finalUrl }
}

async function readHuaweiCookies(client: CdpClient): Promise<W3BridgeCookie[]> {
  const result = (await client.send('Network.getAllCookies')) as { cookies?: unknown[] }
  const cookies: W3BridgeCookie[] = []
  for (const raw of result.cookies ?? []) {
    if (!raw || typeof raw !== 'object') {
      continue
    }
    const candidate = raw as Record<string, unknown>
    if (
      typeof candidate.name !== 'string' ||
      typeof candidate.value !== 'string' ||
      typeof candidate.domain !== 'string'
    ) {
      continue
    }
    cookies.push({
      name: candidate.name,
      value: candidate.value,
      domain: candidate.domain,
      path: typeof candidate.path === 'string' ? candidate.path : '/',
      expires: typeof candidate.expires === 'number' ? candidate.expires : 0,
      secure: candidate.secure === true,
      httpOnly: candidate.httpOnly === true,
      sameSite: typeof candidate.sameSite === 'string' ? candidate.sameSite : undefined
    })
  }
  return cookies
}

/**
 * Run the whole harvest: launch → SPES login → read cookies → teardown.
 * The temporary profile directory is best-effort removed; a locked leftover
 * stays under the OS temp dir and never touches user data.
 */
export async function collectW3SessionCookiesFromSystemChrome(
  deps: W3ChromeSourceDeps
): Promise<W3SessionSourceResult> {
  const platform = deps.platform ?? process.platform
  const env = deps.env ?? process.env
  const chromePath = findSystemChromePath(platform, env, deps.fileExists)
  if (!chromePath) {
    return { ok: false, reason: 'chrome-not-found' }
  }
  let userDataDir: string | null = null
  let process_: W3ChromeProcess | null = null
  let socket: W3CdpSocket | null = null
  try {
    userDataDir = await deps.mkdtemp('w3-session-bridge-')
    process_ = deps.spawnChrome(chromePath, [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      // Why off-screen: headless is the real guarantee, but if a future
      // Chrome build ever ignored --headless=new, the window must still not
      // appear on the user's desktop — zero user perception is the contract.
      '--window-position=-32000,-32000',
      'about:blank'
    ])
    const port = await waitForDebugPort(deps, userDataDir, process_)
    const targetUrl = await findPageTargetWebSocketUrl(deps, port)
    // Why a raced timeout: a CONNECTING socket that never opens would hang
    // the whole harvest (Chrome never killed, temp dir never removed).
    socket = await Promise.race([
      deps.connectWebSocket(targetUrl, deps.signal),
      deps.sleep(W3_SOURCE_CDP_TIMEOUT_MS, deps.signal).then(() => {
        throw new Error('debug-port-timeout')
      })
    ])
    const client = cdpClientFrom(socket)
    const navigation = await navigateUntilSettled(deps, client)
    if (!navigation.ok) {
      return { ok: false, reason: 'sso-failed' }
    }
    throwIfAborted(deps.signal)
    const cookies = await readHuaweiCookies(client)
    return { ok: true, cookies }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, reason: 'aborted' }
    }
    if (error instanceof Error && error.message === 'debug-port-timeout') {
      return { ok: false, reason: 'debug-port-timeout' }
    }
    if (error instanceof Error && error.message === 'launch-failed') {
      return { ok: false, reason: 'launch-failed' }
    }
    return { ok: false, reason: 'cookie-read-failed' }
  } finally {
    // Why socket before process: closing the CDP socket first avoids a burst
    // of socket errors when the browser dies underneath it.
    try {
      socket?.close()
    } catch {
      // Already gone.
    }
    try {
      process_?.kill()
    } catch {
      // Already gone.
    }
    if (userDataDir) {
      // Why a grace sleep: Chrome's child processes need a moment to release
      // the profile directory locks on Windows before it can be removed.
      await deps.sleep(1500)
      try {
        await deps.removeDir(userDataDir)
      } catch {
        // Best-effort; the OS temp dir is the only place a leftover can sit.
      }
    }
  }
}
