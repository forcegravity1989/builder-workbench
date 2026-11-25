import { beforeEach, describe, expect, it, vi } from 'vitest'

const { handleMock, removeHandlerMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
  removeHandlerMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: { on: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn(), getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: handleMock, removeHandler: removeHandlerMock },
  session: { fromPartition: vi.fn() }
}))

// Why: dashboard popouts share the same preload, so they can reach window.api.w3Account.
// These modules are only used by the (unreached) trusted path; mock the ones with
// import-time side effects so the guard can be exercised in isolation.
vi.mock('../window/dashboard-popout-window', () => ({
  isDashboardPopoutRenderer: vi.fn(() => false)
}))
vi.mock('../orca-profiles/profile-index-store', () => ({
  ensureActiveOrcaProfile: vi.fn()
}))
vi.mock('../browser/sessions/profiles/browser-session-registry', () => ({
  browserSessionRegistry: {}
}))
vi.mock('../browser/cookies/session-restore/browser-session-cookie-clear', () => ({
  clearBrowserCookieJar: vi.fn()
}))

import { registerW3AccountHandlers } from './w3-account-ipc'
import { setTrustedBrowserRendererWebContentsId } from './browser/browser-renderer-trust'

describe('w3 account IPC sender trust', () => {
  beforeEach(() => {
    handleMock.mockReset()
    removeHandlerMock.mockReset()
    // Only webContents id 999 is the trusted main window; every other sender (e.g.
    // a dashboard popout) must be rejected.
    setTrustedBrowserRendererWebContentsId(999)
  })

  function handlerFor(
    channel: string
  ): (event: { sender: Electron.WebContents }, ...args: unknown[]) => unknown {
    return handleMock.mock.calls.find(([c]) => c === channel)?.[1] as never
  }

  function untrustedSender(): Electron.WebContents {
    return {
      id: 7,
      isDestroyed: () => false,
      getType: () => 'window',
      getURL: () => 'file:///renderer/popout.html'
    } as Electron.WebContents
  }

  it('denies every W3 channel to an untrusted sender without identity or side effects', async () => {
    registerW3AccountHandlers()
    const responses = {
      'w3Account:status': { state: 'signed-out' },
      'w3Account:start': { status: { state: 'signed-out' } },
      'w3Account:sync': { state: 'signed-out' },
      'w3Account:cancel': { state: 'signed-out' },
      'w3Account:signOut': { state: 'signed-out' },
      'w3Account:openWeb': { ok: false, reason: 'not-signed-in' }
    }
    for (const [channel, response] of Object.entries(responses)) {
      await expect(handlerFor(channel)({ sender: untrustedSender() })).resolves.toEqual(response)
    }
  })
})
