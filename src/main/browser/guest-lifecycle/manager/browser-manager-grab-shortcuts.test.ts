import { beforeEach, describe, expect, it, vi } from 'vitest'

const grabMocks = vi.hoisted(() => ({
  webContentsFromIdMock: vi.fn(),
  guestOnMock: vi.fn(),
  guestOffMock: vi.fn(),
  guestSetBackgroundThrottlingMock: vi.fn(),
  guestSetWindowOpenHandlerMock: vi.fn(),
  guestExecuteJavaScriptMock: vi.fn(),
  guestExecuteJavaScriptInIsolatedWorldMock: vi.fn(),
  guestIsDestroyedMock: vi.fn(() => false),
  guestGetZoomFactorMock: vi.fn(() => 1),
  guestCapturePageMock: vi.fn(),
  menuBuildFromTemplateMock: vi.fn(),
  rendererSendMock: vi.fn(),
  rendererIsDestroyedMock: vi.fn(() => false)
}))

vi.mock('electron', () => ({
  clipboard: { writeText: vi.fn() },
  shell: { openExternal: vi.fn() },
  Menu: { buildFromTemplate: grabMocks.menuBuildFromTemplateMock },
  webContents: { fromId: grabMocks.webContentsFromIdMock }
}))
import { resetGrabTestEnvironment } from './grab/browser-manager-grab-test-harness'

const { guestExecuteJavaScriptMock, guestOnMock, rendererSendMock } = grabMocks

describe('browserManager grab operations', () => {
  const primaryModifier =
    process.platform === 'darwin' ? { meta: true, control: false } : { meta: false, control: true }

  beforeEach(() => {
    resetGrabTestEnvironment(grabMocks)
  })

  describe('grab shortcut forwarding', () => {
    it('does not forward cmd/ctrl+c when the guest reports native copy should win', async () => {
      const handlers = guestOnMock.mock.calls
        .filter(([eventName]) => eventName === 'before-input-event')
        .map(([, handler]) => handler)
      expect(handlers.length).toBeGreaterThan(0)

      guestExecuteJavaScriptMock.mockResolvedValueOnce(false)
      const preventDefault = vi.fn()
      for (const handler of handlers) {
        handler(
          { preventDefault } as never,
          {
            type: 'keyDown',
            ...primaryModifier,
            shift: false,
            alt: false,
            key: 'c'
          } as never
        )
      }

      await Promise.resolve()
      await Promise.resolve()

      expect(guestExecuteJavaScriptMock).toHaveBeenCalled()
      expect(preventDefault).not.toHaveBeenCalled()
      expect(rendererSendMock).not.toHaveBeenCalled()
    })
  })
})
