import { app, BrowserWindow, ipcMain, session } from 'electron'
import {
  W3_ACCOUNT_STATUS_CHANGED_CHANNEL,
  type W3AccountStatus,
  type W3OpenWebRequest,
  type W3OpenWebResult,
  type W3StartLoginResult
} from '../../shared/w3-account'
import { ensureActiveOrcaProfile } from '../orca-profiles/profile-index-store'
import { browserSessionRegistry } from '../browser/browser-session-registry'
import { isDashboardPopoutRenderer } from '../window/dashboard-popout-window'
import { isTrustedBrowserRenderer } from './browser-renderer-trust'
import { getW3AccountConfig, type W3AccountConfig } from '../w3-account/w3-account-config'
import { ensureW3SessionProfile } from '../w3-account/w3-account-session-store'
import {
  W3AccountService,
  type W3FetchInit,
  type W3FetchResponse,
  type W3LoginWindowHandle
} from '../w3-account/w3-account-service'

// Why: the status carries identity (name/employee no). Only the main app window
// may receive it — never dashboard popouts or the W3 login window itself.
function broadcast(status: W3AccountStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue
    }
    const contents = window.webContents
    if (
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

function isW3LoginWindow(contents: Electron.WebContents): boolean {
  return loginWindow !== null && !loginWindow.isDestroyed() && contents.id === loginWindow.webContents.id
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
        // Why: clear all local auth storage of the dedicated partition — the
        // W3 login lives in its cookies AND possibly its web storage. Other
        // partitions are never touched.
        await sess.clearStorageData({
          storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage']
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
        service?.dispose()
        service = null
      })
    }
  }
  return service
}

export function registerW3AccountHandlers(): void {
  ipcMain.removeHandler('w3Account:status')
  ipcMain.removeHandler('w3Account:start')
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
