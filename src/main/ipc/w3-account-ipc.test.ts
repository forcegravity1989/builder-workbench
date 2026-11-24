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
vi.mock('../browser/browser-session-registry', () => ({
  browserSessionRegistry: {}
}))

import { registerW3AccountHandlers } from './w3-account-ipc'
import { setTrustedBrowserRendererWebContentsId } from './browser-renderer-trust'

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

  it('returns an identity-free status to an untrusted sender', async () => {
    registerW3AccountHandlers()
    await expect(handlerFor('w3Account:status')({ sender: untrustedSender() })).resolves.toEqual({
      state: 'signed-out'
    })
  })

  it('refuses login / sync / cancel / sign-out from an untrusted sender', async () => {
    registerW3AccountHandlers()
    await expect(handlerFor('w3Account:start')({ sender: untrustedSender() })).resolves.toEqual({
      status: { state: 'signed-out' }
    })
    await expect(handlerFor('w3Account:sync')({ sender: untrustedSender() })).resolves.toEqual({
      state: 'signed-out'
    })
    await expect(handlerFor('w3Account:cancel')({ sender: untrustedSender() })).resolves.toEqual({
      state: 'signed-out'
    })
    await expect(handlerFor('w3Account:signOut')({ sender: untrustedSender() })).resolves.toEqual({
      state: 'signed-out'
    })
  })

  it('refuses openWeb from an untrusted sender', async () => {
    registerW3AccountHandlers()
    await expect(handlerFor('w3Account:openWeb')({ sender: untrustedSender() })).resolves.toEqual({
      ok: false,
      reason: 'not-signed-in'
    })
  })
})
