import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeAnnotation } from '@/store/slices/browser-annotation-test-fixture'
import type { BrowserSetAnnotationViewportBridgeArgs } from '../../../../../shared/browser-annotation-viewport-bridge'
import { syncGuestAnnotationViewportBridge } from './guest-annotation-viewport-bridge'

afterEach(() => vi.unstubAllGlobals())

function createBridge() {
  const setAnnotationViewportBridge = vi
    .fn<(args: BrowserSetAnnotationViewportBridgeArgs) => Promise<void>>()
    .mockResolvedValue(undefined)
  vi.stubGlobal('window', { api: { browser: { setAnnotationViewportBridge } } })
  const notes = [makeAnnotation('page-1', 'old'), makeAnnotation('page-1', 'fresh')]
  return { setAnnotationViewportBridge, notes }
}

describe('annotation viewport bridge sync', () => {
  it('projects every stored note with its tray index while no capture is pending', () => {
    const { setAnnotationViewportBridge, notes } = createBridge()
    syncGuestAnnotationViewportBridge({
      toolTargetId: 'page-1',
      annotations: notes,
      pendingPayload: null,
      surfaceActive: true,
      token: 'token'
    })
    expect(setAnnotationViewportBridge).toHaveBeenLastCalledWith(
      expect.objectContaining({
        browserPageId: 'page-1',
        enabled: true,
        emitViewport: false,
        markers: [
          expect.objectContaining({ id: 'old', index: 0 }),
          expect.objectContaining({ id: 'fresh', index: 1 })
        ]
      })
    )
  })

  it('tracks only the pending selection and mints it from the capture time', () => {
    const { setAnnotationViewportBridge, notes } = createBridge()
    syncGuestAnnotationViewportBridge({
      toolTargetId: 'page-1',
      annotations: notes,
      pendingPayload: notes[1].payload,
      surfaceActive: true,
      token: 'token'
    })
    expect(setAnnotationViewportBridge).toHaveBeenLastCalledWith(
      expect.objectContaining({
        enabled: true,
        emitViewport: true,
        markers: [expect.objectContaining({ id: 'old' }), expect.objectContaining({ id: 'fresh' })],
        selectionId: notes[1].payload.page.capturedAt
      })
    )
    syncGuestAnnotationViewportBridge({
      toolTargetId: 'page-1',
      annotations: notes,
      pendingPayload: notes[1].payload,
      surfaceActive: false,
      token: 'token'
    })
    expect(setAnnotationViewportBridge).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false })
    )
  })

  it('tolerates a destroyed guest without retaining or throwing a rejected bridge call', async () => {
    const { setAnnotationViewportBridge, notes } = createBridge()
    setAnnotationViewportBridge.mockRejectedValueOnce(new Error('Guest destroyed'))
    expect(() =>
      syncGuestAnnotationViewportBridge({
        toolTargetId: 'page-1',
        annotations: notes,
        pendingPayload: null,
        surfaceActive: true,
        token: 'token'
      })
    ).not.toThrow()
    await Promise.resolve()
  })
})
