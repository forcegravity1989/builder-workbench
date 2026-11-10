import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  app: { getPath: browserMocks.appGetPathMock },
  BrowserWindow: { fromWebContents: browserMocks.browserWindowFromWebContentsMock },
  clipboard: { writeText: vi.fn() },
  shell: { openExternal: browserMocks.shellOpenExternalMock },
  Menu: { buildFromTemplate: browserMocks.menuBuildFromTemplateMock },
  screen: { getCursorScreenPoint: browserMocks.screenGetCursorScreenPointMock },
  webContents: { fromId: browserMocks.webContentsFromIdMock }
}))
vi.mock('../popups/presentation/popup-origin-bar-window', () => ({
  openPopupWithOriginBar: browserMocks.openPopupWithOriginBarMock
}))

import { browserManager } from './browser-manager'
import { resetBrowserManagerMocks, resetBrowserManagerState } from './browser-manager-test-harness'
import {
  mintDocPreviewGrant,
  revokeAllDocPreviewGrants
} from '../../document-preview/doc-preview-grant-registry'
import { buildDocPreviewUrl } from '../../../../shared/doc-preview-scheme'

type GuestFake = {
  id: number
  url: string
  listeners: Map<string, ((...args: never[]) => void)[]>
  windowOpenHandler: ((details: { url: string; frameName: string }) => unknown) | null
  webRtcPolicy: string | null
  isDestroyed: () => boolean
  isCurrentlyAudible: () => boolean
  isFocused: () => boolean
  getURL: () => string
  getType: () => string
  setBackgroundThrottling: (value: boolean) => void
  setWebRTCIPHandlingPolicy: (policy: string) => void
  setWindowOpenHandler: (handler: (details: { url: string; frameName: string }) => unknown) => void
  executeJavaScriptInIsolatedWorld: ReturnType<typeof vi.fn>
  debugger: {
    isAttached: () => boolean
    attach: ReturnType<typeof vi.fn>
    sendCommand: ReturnType<typeof vi.fn>
    on: ReturnType<typeof vi.fn>
    off: ReturnType<typeof vi.fn>
  }
  on: (event: string, listener: (...args: never[]) => void) => void
  once: (event: string, listener: (...args: never[]) => void) => void
  off: (event: string, listener: (...args: never[]) => void) => void
}

function createGuest(id: number, url: string): GuestFake {
  const listeners = new Map<string, ((...args: never[]) => void)[]>()
  const guest: GuestFake = {
    id,
    url,
    listeners,
    windowOpenHandler: null,
    webRtcPolicy: null,
    isDestroyed: () => false,
    isCurrentlyAudible: () => false,
    isFocused: () => true,
    getURL: () => guest.url,
    getType: () => 'webview',
    setBackgroundThrottling: vi.fn(),
    setWebRTCIPHandlingPolicy: (policy: string) => {
      guest.webRtcPolicy = policy
    },
    setWindowOpenHandler: (handler) => {
      guest.windowOpenHandler = handler
    },
    executeJavaScriptInIsolatedWorld: vi.fn(async () => undefined),
    debugger: {
      isAttached: () => true,
      attach: vi.fn(),
      sendCommand: vi.fn(async () => undefined),
      on: vi.fn(),
      off: vi.fn()
    },
    on: (event, listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener])
    },
    once: (event, listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener])
    },
    off: (event, listener) => {
      listeners.set(
        event,
        (listeners.get(event) ?? []).filter((entry) => entry !== listener)
      )
    }
  }
  return guest
}

/** Drives the guest's own will-navigate listeners and reports whether they refused. */
function navigateTo(guest: GuestFake, url: string): boolean {
  let prevented = false
  const event = { preventDefault: () => (prevented = true) } as never
  for (const listener of guest.listeners.get('will-navigate') ?? []) {
    ;(listener as (event: unknown, url: string) => void)(event, url)
  }
  return prevented
}

const host = { id: 5001, send: vi.fn() } as unknown as Electron.WebContents

beforeEach(() => {
  resetBrowserManagerMocks(browserMocks)
  resetBrowserManagerState()
  revokeAllDocPreviewGrants()
  browserMocks.guestSetBackgroundThrottlingMock.mockReturnValue(undefined)
})

describe('guest policy profiles', () => {
  function attachPreviewGuest(id = 301): {
    guest: GuestFake
    grantId: string
    browserPageId: string
  } {
    const browserPageId = `doc-page-${id}`
    const grant = mintDocPreviewGrant({
      owner: { kind: 'ssh', connectionId: 'ssh-1' },
      root: '/home/alice/docs',
      entryRelativePath: 'index.html',
      browserPageId
    })
    const guest = createGuest(id, buildDocPreviewUrl(grant.id, 'index.html'))
    browserManager.attachGuestPolicies(guest as never, null, { profile: 'workspace-doc', host })
    return { guest, grantId: grant.id, browserPageId }
  }

  it('holds a workspace-document guest inside the grant it is showing', () => {
    const { guest, grantId } = attachPreviewGuest()

    expect(navigateTo(guest, buildDocPreviewUrl(grantId, 'other.html'))).toBe(false)
    expect(navigateTo(guest, 'https://example.com/')).toBe(true)
    expect(guest.webRtcPolicy).toBe('disable_non_proxied_udp')
  })

  it('denies every window a workspace-document guest asks for', () => {
    const { guest } = attachPreviewGuest()

    expect(guest.windowOpenHandler?.({ url: 'https://example.com/', frameName: '' })).toEqual({
      action: 'deny'
    })
  })

  // The seam the whole split rests on: one public door answers for both halves, and each page id
  // resolves in exactly one of them. Asserted against the real manager, because the IPC census
  // test has to mock it.
  describe('the one door across both halves of the registry', () => {
    const BROWSING_PAGE_ID = 'browser-page-1'

    function registerBrowsingGuest(id = 400): GuestFake {
      const guest = createGuest(id, 'https://example.com/')
      browserMocks.webContentsFromIdMock.mockReturnValue(guest)
      browserManager.attachGuestPolicies(guest as never)
      browserManager.registerGuest({
        browserPageId: BROWSING_PAGE_ID,
        workspaceId: 'workspace-1',
        worktreeId: 'wt-1',
        webContentsId: id,
        rendererWebContentsId: host.id
      })
      return guest
    }

    // Why this is the containment claim and not a lookup detail: page management, agent commands,
    // download routing and certificate attribution all read the browsing map directly, so a
    // document page being absent from it is what fences them without a guard of their own.
    it('keeps a document page out of the browsing map entirely', () => {
      registerBrowsingGuest()
      const { browserPageId } = attachPreviewGuest()

      expect(browserManager.getGuestWebContentsId(browserPageId)).toBeNull()
      expect([...browserManager.getWebContentsIdByTabId().keys()]).toEqual([BROWSING_PAGE_ID])
    })
  })
})
