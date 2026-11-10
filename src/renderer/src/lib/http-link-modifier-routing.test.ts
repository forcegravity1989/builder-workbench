import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  openHttpLink,
  registerHttpLinkStoreAccessor,
  registerWorkspaceHttpLinkBrowserOpener
} from './browser/navigation/http-link-routing'

const openUrl = vi.fn(async () => {})
const openBrowser = vi.fn(async () => 'opened-page')
const state = {
  settings: {} as {
    openLinksInApp?: boolean
    openLinksInAppModifierInverts?: boolean
    activeRuntimeEnvironmentId?: string | null
  },
  setActiveWorktree: vi.fn(),
  createBrowserTab: vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
  registerHttpLinkStoreAccessor(() => state)
  registerWorkspaceHttpLinkBrowserOpener(openBrowser)
  vi.stubGlobal('window', { api: { shell: { openUrl } } })
})
afterEach(() => {
  registerWorkspaceHttpLinkBrowserOpener(null)
  vi.unstubAllGlobals()
})

function destination(modifierHeld: boolean, openLinksInApp: boolean, inverts: boolean): string {
  openUrl.mockClear()
  openBrowser.mockClear()
  state.settings = { openLinksInApp, openLinksInAppModifierInverts: inverts }
  openHttpLink('https://example.com/', {
    worktreeId: 'wt-1',
    modifierHeld,
    sourceOwner: { kind: 'local' }
  })
  expect(openUrl.mock.calls.length + openBrowser.mock.calls.length).toBe(1)
  return openBrowser.mock.calls.length ? 'in-app' : 'system'
}

describe('modifier routing through openHttpLink', () => {
  it('is inert without the modifier regardless of settings', () => {
    for (const inverts of [true, false]) {
      expect(destination(false, true, inverts)).toBe('in-app')
      expect(destination(false, false, inverts)).toBe('system')
    }
  })
  it('always forces the system browser when inverting is off', () => {
    expect(destination(true, true, false)).toBe('system')
    expect(destination(true, false, false)).toBe('system')
  })
  it('still reaches the system browser when inverting and links open in Orca', () => {
    expect(destination(true, true, true)).toBe('system')
  })
  it('reaches Orca when inverting and links open in the system browser', () => {
    expect(destination(true, false, true)).toBe('in-app')
  })
  it('only diverges from the legacy behavior when links open externally', () => {
    expect(destination(true, true, true)).toBe(destination(true, true, false))
    expect(destination(true, false, true)).not.toBe(destination(true, false, false))
  })
})

describe('modifier routing across link source owners', () => {
  it('still lets the inverting modifier pull a local link into Orca', () => {
    state.settings = { openLinksInApp: false, openLinksInAppModifierInverts: true }
    openHttpLink('https://example.com/', {
      worktreeId: 'wt-1',
      modifierHeld: true,
      sourceOwner: { kind: 'local' }
    })
    expect(openBrowser).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'wt-1',
        url: 'https://example.com/',
        intent: { kind: 'url' }
      })
    )
    expect(openUrl).not.toHaveBeenCalled()
  })
  it('lets an inverting modifier reach Orca on the owning runtime', () => {
    state.settings = {
      openLinksInApp: false,
      openLinksInAppModifierInverts: true,
      activeRuntimeEnvironmentId: null
    }
    openHttpLink('https://example.com/', {
      allowRemoteInApp: true,
      worktreeId: 'wt-1',
      modifierHeld: true,
      sourceOwner: { kind: 'runtime', runtimeEnvironmentId: 'env-1' }
    })
    expect(openBrowser).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRuntimeEnvironmentId: 'env-1'
      })
    )
    expect(openUrl).not.toHaveBeenCalled()
  })
  it('keeps the legacy modifier on the system browser when inversion is off', () => {
    state.settings = {
      openLinksInApp: false,
      openLinksInAppModifierInverts: false,
      activeRuntimeEnvironmentId: null
    }
    openHttpLink('https://example.com/', {
      worktreeId: 'wt-1',
      modifierHeld: true,
      sourceOwner: { kind: 'runtime', runtimeEnvironmentId: 'env-1' }
    })
    expect(openUrl).toHaveBeenCalledWith('https://example.com/')
    expect(openBrowser).not.toHaveBeenCalled()
  })
})
