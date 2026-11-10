import { afterEach, describe, expect, it, vi } from 'vitest'

import { installBrowserWindowCloseGuard } from './browser-window-close-installation'

describe('browser window close preload', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('installs a non-replaceable window.close that delegates to the guest close bridge', () => {
    const nativeClose = vi.fn()
    const requestClose = vi.fn()
    vi.stubGlobal('window', { close: nativeClose })

    installBrowserWindowCloseGuard(requestClose)

    expect(window.close()).toBeUndefined()
    expect(requestClose).toHaveBeenCalledOnce()
    expect(nativeClose).not.toHaveBeenCalled()
    expect(window.close).not.toBe(nativeClose)
    expect(Reflect.set(window, 'close', nativeClose)).toBe(false)
  })
})
