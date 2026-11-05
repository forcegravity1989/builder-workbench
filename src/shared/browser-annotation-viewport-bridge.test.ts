// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildBrowserAnnotationViewportBridgeScript,
  isValidBrowserAnnotationViewportBridgeMarkers
} from './browser-annotation-viewport-bridge'

afterEach(() => {
  const state = (globalThis as Record<string, any>).__orcaBrowserAnnotationViewportBridge
  if (state?.requestUpdate) {
    window.removeEventListener('scroll', state.requestUpdate, true)
    document.removeEventListener('scroll', state.requestUpdate, true)
    window.removeEventListener('resize', state.requestUpdate, true)
  }
  delete (globalThis as Record<string, any>).__orcaBrowserAnnotationViewportBridge
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('annotation guest marker protocol', () => {
  it('tracks live bounds on inner scroll and hides clipped or detached targets', () => {
    let frame: FrameRequestCallback | undefined
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frame = callback
      return 1
    })
    const scroller = document.createElement('div')
    scroller.style.overflowY = 'auto'
    const target = document.createElement('button')
    target.id = 'target'
    scroller.append(target)
    document.body.append(scroller)
    let y = 80
    const rect = (top: number, height = 20) => ({
      x: 20,
      y: top,
      width: 100,
      height,
      left: 20,
      top,
      right: 120,
      bottom: top + height,
      toJSON() {}
    })
    vi.spyOn(target, 'getBoundingClientRect').mockImplementation(() => rect(y))
    vi.spyOn(target, 'getClientRects').mockImplementation(() => [rect(y)] as unknown as DOMRectList)
    vi.spyOn(scroller, 'getBoundingClientRect').mockImplementation(() => rect(0, 200))
    const marker = {
      id: 'note',
      index: 0,
      selector: '#target',
      isFixed: false,
      rectPage: rect(80),
      rectViewport: rect(80)
    }
    expect(isValidBrowserAnnotationViewportBridgeMarkers([marker])).toBe(true)
    new Function(
      buildBrowserAnnotationViewportBridgeScript({
        enabled: true,
        emitViewport: false,
        markers: [marker],
        token: 'annotationviewporttoken'
      })
    )()
    const state = (globalThis as Record<string, any>).__orcaBrowserAnnotationViewportBridge
    const badge = state.markerElements.get('note') as HTMLElement
    const flush = () => {
      const callback = frame
      frame = undefined
      callback?.(0)
    }
    flush()
    expect(badge.style.transform).toContain('88px')
    y = 30
    scroller.dispatchEvent(new Event('scroll'))
    flush()
    expect(badge.style.transform).toContain('38px')
    y = 190
    scroller.dispatchEvent(new Event('scroll'))
    flush()
    expect(badge.style.display).toBe('none')
    target.remove()
    window.dispatchEvent(new Event('scroll'))
    flush()
    expect(badge.style.display).toBe('none')
  })

  it('rejects unbounded selectors at the bridge boundary', () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 }
    expect(
      isValidBrowserAnnotationViewportBridgeMarkers([
        {
          id: 'note',
          index: 0,
          isFixed: false,
          selector: 'x'.repeat(701),
          rectPage: rect,
          rectViewport: rect
        }
      ])
    ).toBe(false)
  })
})
