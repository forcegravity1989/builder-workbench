import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browserMocks = vi.hoisted(() => ({
  appGetPathMock: vi.fn(() => '/downloads'),
  shellOpenExternalMock: vi.fn(),
  browserWindowFromWebContentsMock: vi.fn(),
  menuBuildFromTemplateMock: vi.fn(),
  guestOffMock: vi.fn(),
  guestOnMock: vi.fn(),
  guestSetBackgroundThrottlingMock: vi.fn(),
  guestSetWindowOpenHandlerMock: vi.fn(),
  guestOpenDevToolsMock: vi.fn(),
  webContentsFromIdMock: vi.fn(),
  screenGetCursorScreenPointMock: vi.fn(() => ({ x: 0, y: 0 })),
  openPopupWithOriginBarMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getPath: browserMocks.appGetPathMock
  },
  BrowserWindow: {
    fromWebContents: browserMocks.browserWindowFromWebContentsMock
  },
  clipboard: { writeText: vi.fn() },
  shell: { openExternal: browserMocks.shellOpenExternalMock },
  Menu: {
    buildFromTemplate: browserMocks.menuBuildFromTemplateMock
  },
  screen: {
    getCursorScreenPoint: browserMocks.screenGetCursorScreenPointMock
  },
  webContents: {
    fromId: browserMocks.webContentsFromIdMock
  }
}))

vi.mock('../popups/presentation/popup-origin-bar-window', () => ({
  openPopupWithOriginBar: browserMocks.openPopupWithOriginBarMock
}))

import { browserManager } from './browser-manager'
import {
  rendererWebContentsId,
  resetBrowserManagerMocks,
  resetBrowserManagerState
} from './browser-manager-test-harness'
import { installDocPreviewGuestPolicy } from '../../document-preview/doc-preview-guest-policy'
import {
  mintDocPreviewGrant,
  revokeAllDocPreviewGrants
} from '../../document-preview/doc-preview-grant-registry'
import { buildDocPreviewUrl } from '../../../../shared/doc-preview-scheme'

/**
 * A page the document half of the registry really holds. Built rather than named: membership is
 * what both doors refuse on now, so an id that merely looks like a preview's would be admitted.
 */
function registerWorkspaceDocPage(browserPageId: string): void {
  const grant = mintDocPreviewGrant({
    owner: { kind: 'ssh', connectionId: 'ssh-1' },
    root: '/home/alice/docs',
    entryRelativePath: 'index.html',
    browserPageId
  })
  const guest = {
    isFocused: () => false,
    isDestroyed: () => false,
    getURL: () => buildDocPreviewUrl(grant.id, grant.entryRelativePath),
    on: vi.fn(),
    once: vi.fn(),
    setWindowOpenHandler: vi.fn(),
    setWebRTCIPHandlingPolicy: vi.fn()
  }
  installDocPreviewGuestPolicy(guest as never, { id: rendererWebContentsId, send: vi.fn() })
}

const {
  guestOffMock,
  guestOnMock,
  guestSetBackgroundThrottlingMock,
  guestSetWindowOpenHandlerMock,
  guestOpenDevToolsMock,
  webContentsFromIdMock,
  menuBuildFromTemplateMock
} = browserMocks

describe('browserManager', () => {
  beforeEach(() => {
    resetBrowserManagerMocks(browserMocks)
    resetBrowserManagerState()
    revokeAllDocPreviewGrants()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Why both doors: one id in both halves of the registry would make the tool door answer with a
  // document guest for a page the reader is browsing in.
  it.each(['registerGuest', 'registerOffscreenGuest'] as const)(
    'refuses %s for a page the document registry already holds',
    (entryPoint) => {
      const guest = {
        id: 129,
        isDestroyed: vi.fn(() => false),
        getType: vi.fn(() => 'webview'),
        setBackgroundThrottling: guestSetBackgroundThrottlingMock,
        setWindowOpenHandler: guestSetWindowOpenHandlerMock,
        on: guestOnMock,
        off: guestOffMock,
        openDevTools: guestOpenDevToolsMock
      }
      webContentsFromIdMock.mockReturnValue(guest)
      browserManager.attachGuestPolicies(guest as never)
      const browserPageId = 'doc-page-1'
      registerWorkspaceDocPage(browserPageId)

      if (entryPoint === 'registerGuest') {
        expect(
          browserManager.registerGuest({
            browserPageId,
            webContentsId: guest.id,
            rendererWebContentsId
          })
        ).toBe(false)
      } else {
        expect(
          browserManager.registerOffscreenGuest({ browserPageId, webContentsId: guest.id })
        ).toBe(false)
      }

      expect(browserManager.getGuestWebContentsId(browserPageId)).toBeNull()
    }
  )

  it('rejects non-webview guest types to prevent privilege escalation', () => {
    // A compromised renderer could send the main window's own webContentsId.
    // registerGuest must reject it because getType() would return 'window',
    // not 'webview'.
    const mainWindowContents = {
      isDestroyed: vi.fn(() => false),
      getType: vi.fn(() => 'window'),
      setBackgroundThrottling: guestSetBackgroundThrottlingMock,
      setWindowOpenHandler: guestSetWindowOpenHandlerMock,
      on: guestOnMock,
      off: guestOffMock,
      openDevTools: guestOpenDevToolsMock
    }
    webContentsFromIdMock.mockReturnValue(mainWindowContents)

    browserManager.registerGuest({
      browserPageId: 'browser-evil',
      webContentsId: 1,
      rendererWebContentsId
    })

    // The guest should NOT be registered
    expect(browserManager.getGuestWebContentsId('browser-evil')).toBeNull()
    // setWindowOpenHandler must NOT have been called on the main window's webContents
    expect(guestSetWindowOpenHandlerMock).not.toHaveBeenCalled()
  })

  it('rejects registration for guests that never received attach-time policy wiring', () => {
    const guest = {
      id: 777,
      isDestroyed: vi.fn(() => false),
      getType: vi.fn(() => 'webview'),
      setBackgroundThrottling: guestSetBackgroundThrottlingMock,
      setWindowOpenHandler: guestSetWindowOpenHandlerMock,
      on: guestOnMock,
      off: guestOffMock,
      openDevTools: guestOpenDevToolsMock
    }
    webContentsFromIdMock.mockReturnValue(guest)

    browserManager.registerGuest({
      browserPageId: 'browser-1',
      webContentsId: 777,
      rendererWebContentsId
    })

    expect(browserManager.getGuestWebContentsId('browser-1')).toBeNull()
    expect(menuBuildFromTemplateMock).not.toHaveBeenCalled()
  })
})
