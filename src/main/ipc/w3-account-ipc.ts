import { app, BrowserWindow, ipcMain, session } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  W3_ACCOUNT_STATUS_CHANGED_CHANNEL,
  type W3AccountStatus,
  type W3OpenWebRequest,
  type W3OpenWebResult,
  type W3StartLoginResult
} from '../../shared/w3-account'
import { ensureActiveOrcaProfile } from '../orca-profiles/profile-index-store'
import { clearBrowserCookieJar } from '../browser/cookies/session-restore/browser-session-cookie-clear'
import { browserSessionRegistry } from '../browser/sessions/profiles/browser-session-registry'
import { isDashboardPopoutRenderer } from '../window/dashboard-popout-window'
import { isTrustedBrowserRenderer } from './browser/browser-renderer-trust'
import { getW3AccountConfig, type W3AccountConfig } from '../w3-account/w3-account-config'
import { ensureW3SessionProfile } from '../w3-account/w3-account-session-store'
import type { W3FetchInit, W3FetchResponse } from '../w3-account/w3-account-identity'
import { W3AccountService, type W3LoginWindowHandle } from '../w3-account/w3-account-service'
import {
  syncW3SessionFromSystemBrowser,
  type W3SessionBridgeResult
} from '../w3-account/w3-session-bridge'
import {
  collectW3SessionCookiesFromSystemChrome,
  type W3CdpSocket
} from '../w3-account/w3-system-chrome-session-source'

// Why: the status carries identity (name/employee no). Only the main app window
// may receive it — never dashboard popouts or the W3 login window itself.
function broadcast(status: W3AccountStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue
    }
    const contents = window.webContents
    if (
      !isTrustedBrowserRenderer(contents) ||
      isDashboardPopoutRenderer(contents) ||
      isW3LoginWindow(contents) ||
      isW3WebWindow(contents)
    ) {
      continue
    }
    try {
      contents.send(W3_ACCOUNT_STATUS_CHANGED_CHANNEL, status)
    } catch {
      // A renderer can disappear between isDestroyed() and send().
    }
  }
}

let service: W3AccountService | null = null
let exitHookInstalled = false
let loginWindow: BrowserWindow | null = null
// Why: a set, not a single ref — the user may open several verification pages.
const webWindows = new Set<BrowserWindow>()
// The live harvest Chrome, so will-quit can kill it synchronously — the
// collect() cleanup runs on the microtask queue and may never get a turn.
let liveHarvestChrome: { kill(): void } | null = null

function isW3LoginWindow(contents: Electron.WebContents): boolean {
  return (
    loginWindow !== null && !loginWindow.isDestroyed() && contents.id === loginWindow.webContents.id
  )
}

function isW3WebWindow(contents: Electron.WebContents): boolean {
  for (const window of webWindows) {
    if (!window.isDestroyed() && contents.id === window.webContents.id) {
      return true
    }
  }
  return false
}

/**
 * Open the W3 portal in a dedicated, hardened window bound to the W3 session
 * partition: no preload, no Node, sandbox + contextIsolation, TLS intact.
 * The window loads the configured login page and nothing else.
 */
function openW3LoginWindow(config: W3AccountConfig, sessionProfileId: string): W3LoginWindowHandle {
  closeW3LoginWindow()
  const sess = session.fromPartition(sessionProfileId)
  const window = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 640,
    minHeight: 480,
    title: 'W3 登录',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: undefined,
      // Why: the W3 session (cookies/storage) is exactly what the login window
      // must share with the account-API poller and the built-in browser tabs.
      session: sess
    }
  })
  loginWindow = window
  window.once('closed', () => {
    if (loginWindow === window) {
      loginWindow = null
    }
  })
  // Why: the login page must not navigate the window to arbitrary schemes.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  void window.loadURL(config.loginUrl).catch(() => {
    // Load errors surface as the poll simply never seeing a 200 — the user
    // gets the bounded timeout, and the window stays open for a retry.
  })
  return {
    isWindowClosed: () => window.isDestroyed(),
    closeWindow: () => {
      closeW3LoginWindow()
    }
  }
}

function closeW3LoginWindow(): void {
  if (loginWindow && !loginWindow.isDestroyed()) {
    try {
      loginWindow.close()
    } catch {
      // Already closing.
    }
  }
  loginWindow = null
}

/**
 * Open a page inside the signed-in W3 session so the user can verify internal
 * access. Same hardened window setup as the login window and, crucially, the
 * SAME dedicated partition — never the default session.
 */
function openW3WebWindow(partition: string, url: string): W3OpenWebResult {
  try {
    const window = new BrowserWindow({
      width: 1000,
      height: 720,
      minWidth: 640,
      minHeight: 480,
      title: 'W3',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: undefined,
        session: session.fromPartition(partition)
      }
    })
    webWindows.add(window)
    window.once('closed', () => {
      webWindows.delete(window)
    })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    void window.loadURL(url).catch(() => {
      // A load error leaves the window open (empty) — the user can see it failed.
    })
    return { ok: true }
  } catch {
    return { ok: false, reason: 'open-failed' }
  }
}

function closeAllW3WebWindows(): void {
  for (const window of webWindows) {
    if (!window.isDestroyed()) {
      try {
        window.close()
      } catch {
        // Already closing.
      }
    }
  }
  webWindows.clear()
}

/** Real binding of the session bridge: controlled system Chrome → W3 partition. */
function syncSessionFromSystemChrome(
  partition: string,
  signal: AbortSignal
): Promise<W3SessionBridgeResult> {
  const sess = session.fromPartition(partition)
  return syncW3SessionFromSystemBrowser({
    collect: (collectSignal) =>
      collectW3SessionCookiesFromSystemChrome({
        spawnChrome: (chromePath, args) => {
          // Why windowsHide + an error listener: a failed spawn (bad override
          // path, Chrome uninstalled mid-session) emits 'error' asynchronously —
          // without a listener Node rethrows it as an uncaughtException and
          // takes down the main process. The harvest reports launch-failed.
          const child = spawn(chromePath, args, { stdio: 'ignore', windowsHide: true })
          let spawnError = false
          child.on('error', () => {
            spawnError = true
          })
          const handle = {
            kill: () => {
              try {
                child.kill()
              } catch {
                // Already gone.
              }
            },
            hasSpawnError: () => spawnError
          }
          liveHarvestChrome = handle
          return handle
        },
        fileExists: (path) => existsSync(path),
        mkdtemp: (prefix) => mkdtemp(join(tmpdir(), prefix)),
        readFileText: (path) => readFile(path, 'utf-8'),
        removeDir: (path) => rm(path, { recursive: true, force: true }),
        fetchJson: async (url) => {
          const timeout = AbortSignal.timeout(5000)
          const requestSignal = collectSignal ? AbortSignal.any([collectSignal, timeout]) : timeout
          const response = await fetch(url, { signal: requestSignal })
          return response.json()
        },
        connectWebSocket: (url, connectSignal) => {
          const ws = new WebSocket(url)
          const wrapper: W3CdpSocket = {
            send: (data) => ws.send(data),
            close: () => ws.close(),
            onmessage: null,
            onclose: null,
            onerror: null
          }
          ws.onmessage = (event) => wrapper.onmessage?.(event)
          ws.onclose = () => wrapper.onclose?.()
          ws.onerror = () => wrapper.onerror?.()
          // Why await open: a CONNECTING socket throws on send, which the
          // harvest would misreport as cookie-read-failed.
          return new Promise<W3CdpSocket>((resolve, reject) => {
            ws.onopen = () => resolve(wrapper)
            ws.onerror = () => reject(new Error('cdp-connect-failed'))
            // Why wire abort: a socket stuck in CONNECTING would otherwise
            // hang the harvest forever — closing it settles this promise and
            // lets the caller's raced timeout / cancel path win.
            connectSignal?.addEventListener(
              'abort',
              () => {
                try {
                  ws.close()
                } catch {
                  // Already closed.
                }
                reject(new DOMException('aborted', 'AbortError'))
              },
              { once: true }
            )
          })
        },
        sleep: (ms, sleepSignal) =>
          new Promise<void>((resolve, reject) => {
            const onAbort = (): void => {
              clearTimeout(timer)
              reject(new DOMException('aborted', 'AbortError'))
            }
            const timer = setTimeout(() => {
              sleepSignal?.removeEventListener('abort', onAbort)
              resolve()
            }, ms)
            sleepSignal?.addEventListener('abort', onAbort, { once: true })
          }),
        now: () => Date.now(),
        signal: collectSignal
      }),
    setCookie: async (details) => {
      await sess.cookies.set(details)
    },
    now: () => Date.now(),
    signal
  })
}

function getService(): W3AccountService {
  if (!service) {
    service = new W3AccountService({
      getConfig: () => getW3AccountConfig(),
      getActiveProfileId: () => ensureActiveOrcaProfile().profile.id,
      ensureSessionProfile: async (orcaProfileId) => {
        const active = ensureActiveOrcaProfile()
        return ensureW3SessionProfile({
          orcaProfileId,
          profileDirectory: active.profileDirectory,
          registry: browserSessionRegistry
        })
      },
      syncSession: (partition, signal) => syncSessionFromSystemChrome(partition, signal),
      // Why: the SAME Electron session the login window uses, so the W3 login
      // cookies are visible to the account-API poll.
      fetch: async (partition, url, init: W3FetchInit): Promise<W3FetchResponse> => {
        try {
          const response = await session.fromPartition(partition).fetch(url, init)
          const textPromise = response.text().catch(() => '')
          return { status: response.status, url: response.url, text: () => textPromise }
        } catch {
          // Network-level failure: the service treats this as transient.
          return { status: 0, url: '', networkError: true, text: async () => '' }
        }
      },
      clearDedicatedStorage: async (partition) => {
        const sess = session.fromPartition(partition)
        await clearBrowserCookieJar(sess)
        await sess.clearStorageData({
          storages: ['localstorage', 'indexdb', 'serviceworkers', 'cachestorage']
        })
        await sess.clearCache()
      },
      openLoginWindow: (config, sessionProfileId) => openW3LoginWindow(config, sessionProfileId),
      broadcast
    })
    if (!exitHookInstalled) {
      exitHookInstalled = true
      app.on('will-quit', () => {
        closeW3LoginWindow()
        closeAllW3WebWindows()
        // Why a synchronous kill here: dispose() only aborts, and the
        // collect() finally-block cleanup may never run before the process
        // exits — that would leave a headless Chrome behind.
        liveHarvestChrome?.kill()
        liveHarvestChrome = null
        service?.dispose()
        service = null
      })
    }
  }
  return service
}

/**
 * Partition of a freshly verified signed-in W3 session, for same-layer main
 * consumers that must ride the W3 SSO cookies (OneBox group discovery).
 * getStatus() performs a real account-API check rather than reading a cache, so
 * this never hands out a partition whose sign-in has already lapsed.
 */
export async function resolveSignedInW3Partition(): Promise<
  { partition: string } | { failure: 'w3-unconfigured' | 'w3-not-signed-in' }
> {
  const status = await getService().getStatus()
  if (status.state === 'unconfigured') {
    return { failure: 'w3-unconfigured' }
  }
  if (status.state !== 'signed-in') {
    return { failure: 'w3-not-signed-in' }
  }
  return { partition: status.sessionPartition }
}

export function registerW3AccountHandlers(): void {
  ipcMain.removeHandler('w3Account:status')
  ipcMain.removeHandler('w3Account:start')
  ipcMain.removeHandler('w3Account:sync')
  ipcMain.removeHandler('w3Account:cancel')
  ipcMain.removeHandler('w3Account:signOut')
  ipcMain.removeHandler('w3Account:openWeb')

  // Why: the W3 IPC is pull-based, and dashboard popouts share the same preload
  // (so they can reach window.api.w3Account). The push channel (broadcast) already
  // excludes popouts; the pull handlers must enforce the same invariant, or a
  // popout could read the identity or drive login/sign-out/openWeb. Only the
  // trusted main app window may cross this boundary; everyone else gets a safe,
  // identity-free default and no side effects.
  ipcMain.handle('w3Account:status', async (event): Promise<W3AccountStatus> => {
    if (!isTrustedBrowserRenderer(event.sender)) {
      return { state: 'signed-out' }
    }
    return getService().getStatus()
  })
  ipcMain.handle('w3Account:start', async (event): Promise<W3StartLoginResult> => {
    if (!isTrustedBrowserRenderer(event.sender)) {
      return { status: { state: 'signed-out' } }
    }
    return getService().startLogin()
  })
  ipcMain.handle('w3Account:sync', async (event): Promise<W3AccountStatus> => {
    if (!isTrustedBrowserRenderer(event.sender)) {
      return { state: 'signed-out' }
    }
    // Why no broadcast here: syncFromSystemBrowser broadcasts sync-pending and
    // the resolved outcome itself; the return value only answers this caller.
    return getService().syncFromSystemBrowser()
  })
  ipcMain.handle('w3Account:cancel', async (event): Promise<W3AccountStatus> => {
    if (!isTrustedBrowserRenderer(event.sender)) {
      return { state: 'signed-out' }
    }
    const status = await getService().cancelLogin()
    broadcast(status)
    return status
  })
  ipcMain.handle('w3Account:signOut', async (event): Promise<W3AccountStatus> => {
    if (!isTrustedBrowserRenderer(event.sender)) {
      return { state: 'signed-out' }
    }
    const status = await getService().signOut()
    broadcast(status)
    return status
  })
  ipcMain.handle(
    'w3Account:openWeb',
    async (event, request?: W3OpenWebRequest): Promise<W3OpenWebResult> => {
      if (!isTrustedBrowserRenderer(event.sender)) {
        return { ok: false, reason: 'not-signed-in' }
      }
      const target = await getService().resolveOpenWebTarget(request?.url)
      if (!target.ok) {
        return { ok: false, reason: target.reason }
      }
      return openW3WebWindow(target.partition, target.url)
    }
  )
}
