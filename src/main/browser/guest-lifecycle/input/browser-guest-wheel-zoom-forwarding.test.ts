import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  resolveGuestMouseWheelZoomDirection,
  setupGuestMouseWheelZoomForwarding
} from './browser-guest-wheel-zoom'

describe('guest mouse wheel browser zoom', () => {
  const browserTabId = 'tab-1'
  let rendererSendMock: ReturnType<typeof vi.fn>
  let guestOnMock: ReturnType<typeof vi.fn>
  let guestOffMock: ReturnType<typeof vi.fn>

  function makeGuest() {
    return {
      on: guestOnMock,
      off: guestOffMock
    } as unknown as Electron.WebContents
  }

  function makeRenderer() {
    return { send: rendererSendMock } as unknown as Electron.WebContents
  }

  function mouseWheel(
    overrides: Partial<Electron.MouseWheelInputEvent> = {}
  ): Electron.MouseWheelInputEvent {
    return {
      type: 'mouseWheel',
      x: 0,
      y: 0,
      deltaY: -120,
      modifiers: ['ctrl'],
      ...overrides
    }
  }

  function triggerBeforeMouse(mouse: Electron.MouseInputEvent): ReturnType<typeof vi.fn> {
    const handler = guestOnMock.mock.calls.find((call) => call[0] === 'before-mouse-event')?.[1] as
      | ((event: Electron.Event, mouse: Electron.MouseInputEvent) => void)
      | undefined
    expect(handler).toBeTypeOf('function')
    const preventDefault = vi.fn()
    handler!({ preventDefault } as unknown as Electron.Event, mouse)
    return preventDefault
  }

  beforeEach(() => {
    rendererSendMock = vi.fn()
    guestOnMock = vi.fn()
    guestOffMock = vi.fn()
  })

  it('resolves ctrl wheel direction from guest mouse input', () => {
    expect(resolveGuestMouseWheelZoomDirection(mouseWheel({ deltaY: -120 }), 'win32')).toBe('in')
    expect(resolveGuestMouseWheelZoomDirection(mouseWheel({ deltaY: 120 }), 'linux')).toBe('out')
  })

  it('allows command wheel only on macOS', () => {
    const commandWheel = mouseWheel({ modifiers: ['cmd'], deltaY: -120 })

    expect(resolveGuestMouseWheelZoomDirection(commandWheel, 'darwin')).toBe('in')
    expect(resolveGuestMouseWheelZoomDirection(commandWheel, 'win32')).toBeNull()
  })

  it('ignores non-zoom wheel input', () => {
    expect(
      resolveGuestMouseWheelZoomDirection(mouseWheel({ modifiers: [], deltaY: -120 }), 'linux')
    ).toBeNull()
    expect(
      resolveGuestMouseWheelZoomDirection(mouseWheel({ modifiers: ['ctrl', 'alt'] }), 'linux')
    ).toBeNull()
    expect(
      resolveGuestMouseWheelZoomDirection(mouseWheel({ modifiers: ['ctrl', 'shift'] }), 'linux')
    ).toBeNull()
    expect(resolveGuestMouseWheelZoomDirection(mouseWheel({ deltaY: 0 }), 'linux')).toBeNull()
    expect(
      resolveGuestMouseWheelZoomDirection(
        { type: 'mouseMove', x: 0, y: 0, modifiers: ['ctrl'] },
        'linux'
      )
    ).toBeNull()
  })

  it('forwards ctrl wheel to browser page zoom and consumes the guest wheel event', () => {
    setupGuestMouseWheelZoomForwarding({
      browserTabId,
      guest: makeGuest(),
      resolveRenderer: () => makeRenderer()
    })

    const preventDefault = triggerBeforeMouse(mouseWheel({ deltaY: -120 }))
    const outPreventDefault = triggerBeforeMouse(mouseWheel({ deltaY: 120 }))

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(outPreventDefault).toHaveBeenCalledTimes(1)
    expect(rendererSendMock).toHaveBeenNthCalledWith(1, 'ui:zoomBrowserPage', {
      browserPageId: 'tab-1',
      direction: 'in'
    })
    expect(rendererSendMock).toHaveBeenNthCalledWith(2, 'ui:zoomBrowserPage', {
      browserPageId: 'tab-1',
      direction: 'out'
    })
  })

  it('consumes guest ctrl wheel even when the renderer is unavailable', () => {
    setupGuestMouseWheelZoomForwarding({
      browserTabId,
      guest: makeGuest(),
      resolveRenderer: () => null
    })

    const preventDefault = triggerBeforeMouse(mouseWheel())

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(rendererSendMock).not.toHaveBeenCalled()
  })

  it('cleans up the mouse wheel listener on teardown', () => {
    const cleanup = setupGuestMouseWheelZoomForwarding({
      browserTabId,
      guest: makeGuest(),
      resolveRenderer: () => makeRenderer()
    })

    cleanup()

    expect(guestOffMock).toHaveBeenCalledWith('before-mouse-event', expect.any(Function))
  })
})
