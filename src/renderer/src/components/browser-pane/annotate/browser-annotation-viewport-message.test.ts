import { describe, expect, it, vi } from 'vitest'
import { BROWSER_ANNOTATION_VIEWPORT_MESSAGE_PREFIX } from '../../../../../shared/browser-annotation-viewport-bridge'
import { consumeBrowserAnnotationViewportMessage } from './browser-annotation-viewport-message'

describe('consumeBrowserAnnotationViewportMessage', () => {
  it('accepts only token-authenticated live target reports', () => {
    const setViewport = vi.fn()
    const report = JSON.stringify({
      scrollX: 0,
      scrollY: 0,
      viewportWidth: 900,
      target: { x: 40, y: 120, width: 120, height: 30 }
    })
    consumeBrowserAnnotationViewportMessage(
      { message: `${BROWSER_ANNOTATION_VIEWPORT_MESSAGE_PREFIX}wrong:${report}` },
      'token',
      setViewport
    )
    expect(setViewport).not.toHaveBeenCalled()

    consumeBrowserAnnotationViewportMessage(
      { message: `${BROWSER_ANNOTATION_VIEWPORT_MESSAGE_PREFIX}token:${report}` },
      'token',
      setViewport
    )
    expect(setViewport).toHaveBeenCalledOnce()
    expect(setViewport.mock.calls[0][0]({ scrollX: 0, scrollY: 0, version: 0 })).toEqual({
      scrollX: 0,
      scrollY: 0,
      viewportWidth: 900,
      target: { x: 40, y: 120, width: 120, height: 30 },
      version: 1
    })
  })

  it('drops unparseable payloads and coerces malformed fields to defaults', () => {
    const setViewport = vi.fn()
    consumeBrowserAnnotationViewportMessage(
      { message: `${BROWSER_ANNOTATION_VIEWPORT_MESSAGE_PREFIX}token:not-json` },
      'token',
      setViewport
    )
    expect(setViewport).not.toHaveBeenCalled()

    // Field-level garbage defaults rather than rejecting the whole report.
    consumeBrowserAnnotationViewportMessage(
      { message: `${BROWSER_ANNOTATION_VIEWPORT_MESSAGE_PREFIX}token:{"scrollX":"no"}` },
      'token',
      setViewport
    )
    expect(setViewport).toHaveBeenCalledOnce()
    expect(setViewport.mock.calls[0][0]({ scrollX: 7, scrollY: 9, version: 3 })).toEqual({
      scrollX: 0,
      scrollY: 0,
      version: 4
    })
  })
})
