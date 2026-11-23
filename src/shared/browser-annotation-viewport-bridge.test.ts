// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildBrowserAnnotationViewportBridgeScript,
  browserAnnotationMarkerSelector,
  isValidBrowserAnnotationViewportBridgeMarkers
} from './browser-annotation-viewport-bridge'

type BridgeState = {
  requestUpdate: EventListener
  markerElements: Map<string, HTMLElement>
  visibilityObserver?: IntersectionObserver
}
type BridgeGlobal = { __orcaBrowserAnnotationViewportBridge?: BridgeState }

afterEach(() => {
  const state = (globalThis as BridgeGlobal).__orcaBrowserAnnotationViewportBridge
  if (state?.requestUpdate) {
    state.visibilityObserver?.disconnect()
    window.removeEventListener('scroll', state.requestUpdate, true)
    document.removeEventListener('scroll', state.requestUpdate, true)
    window.removeEventListener('resize', state.requestUpdate, true)
  }
  delete (globalThis as BridgeGlobal).__orcaBrowserAnnotationViewportBridge
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('annotation guest marker protocol', () => {
  it('tracks live bounds on inner scroll and hides clipped or detached targets', () => {
    let frame: FrameRequestCallback | undefined
    let reportVisibility: (target: Element, visible: boolean) => void = () => {}
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          reportVisibility = (target, isIntersecting) =>
            callback(
              [{ target, isIntersecting } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver
            )
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
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
    const state = (globalThis as BridgeGlobal).__orcaBrowserAnnotationViewportBridge
    const badge = state!.markerElements.get('note') as HTMLElement
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
    // Native visibility may keep fixed descendants visible outside overflow ancestors.
    target.style.position = 'fixed'
    reportVisibility(target, true)
    scroller.dispatchEvent(new Event('scroll'))
    flush()
    expect(badge.style.display).toBe('flex')
    reportVisibility(target, false)
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
    const nativeTruncatedSelector = `${'x'.repeat(700)} (truncated)`
    const marker = { id: 'note', index: 0, isFixed: false, rectPage: rect, rectViewport: rect }
    // An unusable display selector must not reject this note or the rest of the batch.
    expect(
      isValidBrowserAnnotationViewportBridgeMarkers([
        { ...marker, selector: browserAnnotationMarkerSelector(nativeTruncatedSelector) },
        { ...marker, id: 'other', selector: browserAnnotationMarkerSelector('#valid') }
      ])
    ).toBe(true)
    expect(browserAnnotationMarkerSelector(nativeTruncatedSelector)).toBeUndefined()
  })
})
