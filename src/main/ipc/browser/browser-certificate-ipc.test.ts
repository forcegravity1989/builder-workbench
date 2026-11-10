import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { handleMock, removeHandlerMock, proceedCertificateMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
  removeHandlerMock: vi.fn(),
  proceedCertificateMock: vi.fn()
}))

vi.mock('./browser-passwords-ipc', () => ({ registerBrowserPasswordsHandlers: vi.fn() }))

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn() },
  ipcMain: { handle: handleMock, removeHandler: removeHandlerMock },
  webContents: { fromId: vi.fn() }
}))

vi.mock('../../browser/guest-lifecycle/manager/browser-manager', () => ({
  browserCertificateTrustController: { proceed: proceedCertificateMock },
  browserManager: { getWebContentsIdByTabId: vi.fn(() => new Map()) }
}))

import { registerBrowserHandlers, setAgentBrowserBridgeRef } from './browser'
import { setTrustedBrowserRendererWebContentsId } from './browser-renderer-trust'

describe('browser certificate approval IPC', () => {
  beforeEach(() => {
    vi.stubEnv('ELECTRON_RENDERER_URL', '')
    setTrustedBrowserRendererWebContentsId(91)
    handleMock.mockReset()
    removeHandlerMock.mockReset()
    proceedCertificateMock.mockReset()
    proceedCertificateMock.mockReturnValue({ ok: true })
    setAgentBrowserBridgeRef(null)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    setTrustedBrowserRendererWebContentsId(null)
    setAgentBrowserBridgeRef(null)
  })

  it('allows only the trusted renderer to approve an exact certificate challenge', () => {
    registerBrowserHandlers({ getSettings: () => ({}) })
    const proceedHandler = handleMock.mock.calls.find(
      ([channel]) => channel === 'browser:proceedCertificate'
    )?.[1] as (event: { sender: Electron.WebContents }, args: unknown) => unknown
    const trustedSender = {
      id: 91,
      isDestroyed: () => false,
      getType: () => 'window',
      getURL: () => 'file:///renderer/index.html'
    } as Electron.WebContents

    expect(
      proceedHandler(
        { sender: trustedSender },
        { browserPageId: 'page-1', challengeId: 'challenge-1' }
      )
    ).toEqual({ ok: true })
    expect(proceedCertificateMock).toHaveBeenCalledWith('page-1', 'challenge-1')

    proceedCertificateMock.mockClear()
    const untrustedSender = {
      id: 92,
      isDestroyed: () => false,
      getType: () => 'webview',
      getURL: () => 'https://localhost:3443/'
    } as Electron.WebContents
    expect(
      proceedHandler(
        { sender: untrustedSender },
        { browserPageId: 'page-1', challengeId: 'challenge-1' }
      )
    ).toEqual({ ok: false, reason: 'missing' })
    expect(proceedCertificateMock).not.toHaveBeenCalled()
  })

  it('rejects malformed certificate approval IPC arguments', () => {
    registerBrowserHandlers({ getSettings: () => ({}) })
    const proceedHandler = handleMock.mock.calls.find(
      ([channel]) => channel === 'browser:proceedCertificate'
    )?.[1] as (event: { sender: Electron.WebContents }, args: unknown) => unknown
    const sender = {
      id: 91,
      isDestroyed: () => false,
      getType: () => 'window',
      getURL: () => 'file:///renderer/index.html'
    } as Electron.WebContents

    for (const args of [null, {}, { browserPageId: 1, challengeId: 'challenge-1' }]) {
      expect(proceedHandler({ sender }, args)).toEqual({ ok: false, reason: 'missing' })
    }
    expect(proceedCertificateMock).not.toHaveBeenCalled()
  })
})
