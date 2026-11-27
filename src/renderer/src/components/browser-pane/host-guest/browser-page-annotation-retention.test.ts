import { describe, expect, it, vi } from 'vitest'
import { createBrowserPageWebviewNavigationHandlers } from './lifecycle/browser-page-webview-navigation-handlers'

const TAB_ID = 'tab-1'

/**
 * Minimal harness for the navigation handlers, focused on when a main-frame document start
 * invalidates the page's annotations. `committedUrl` is what the guest webview reports via
 * getURL(), i.e. the document being left when a navigation starts.
 */
function createHarness(startUrl: string) {
  const committedUrl = { current: startUrl }
  const webview = {
    getURL: () => committedUrl.current,
    getTitle: () => 'title',
    canGoBack: () => false,
    canGoForward: () => false,
    src: startUrl
  } as unknown as Electron.WebviewTag
  const ref = <T>(value: T) => ({ current: value })
  const invalidateBrowserAnnotationDocument = vi.fn()
  const navigation = createBrowserPageWebviewNavigationHandlers({
    webview,
    browserTabId: TAB_ID,
    browserTabUrl: startUrl,
    recoveryNavigationValidationRef: ref(null),
    activeLoadFailureRef: ref(null),
    lastKnownWebviewUrlRef: ref<string | null>(startUrl),
    addressBarInputRef: ref(null),
    onSetUrlRef: ref(vi.fn()),
    onUpdatePageStateRef: ref(vi.fn()),
    addBrowserHistoryEntryRef: ref(vi.fn()),
    faviconUrlRef: ref(null),
    setAddressBarValue: vi.fn(),
    annotationViewportBridgeTokenRef: ref('token'),
    invalidateBrowserAnnotationDocumentRef: ref(invalidateBrowserAnnotationDocument),
    setBrowserOverlayViewport: vi.fn()
  })

  const startAt = (url: string): void => {
    navigation.handleDidStartNavigation({
      isMainFrame: true,
      isInPlace: false,
      url
    } as Electron.DidStartNavigationEvent)
  }

  return { committedUrl, navigation, startAt, invalidateBrowserAnnotationDocument }
}

describe('browser page annotation retention across navigation starts', () => {
  it('keeps annotations when reloading the same document', () => {
    const harness = createHarness('https://example.com/report')

    // Reload: the guest is leaving the URL it is about to re-enter.
    harness.startAt('https://example.com/report')

    expect(harness.invalidateBrowserAnnotationDocument).not.toHaveBeenCalled()
  })

  it('keeps annotations across a reload of a local file preview', () => {
    const fileUrl = 'file:///D:/02.Coding/orca/workspace/report.html'
    const harness = createHarness(fileUrl)

    harness.startAt(fileUrl)

    expect(harness.invalidateBrowserAnnotationDocument).not.toHaveBeenCalled()
  })

  it('keeps annotations when only the fragment changes', () => {
    const harness = createHarness('https://example.com/report')

    harness.startAt('https://example.com/report#section-2')

    expect(harness.invalidateBrowserAnnotationDocument).not.toHaveBeenCalled()
  })

  it('invalidates annotations when navigating to a different document', () => {
    const harness = createHarness('https://example.com/report')

    harness.startAt('https://example.com/other')

    expect(harness.invalidateBrowserAnnotationDocument).toHaveBeenCalledTimes(1)
  })

  it('invalidates on the first document when nothing is committed yet', () => {
    const harness = createHarness('')

    harness.startAt('https://example.com/report')

    expect(harness.invalidateBrowserAnnotationDocument).toHaveBeenCalledTimes(1)
  })

  it('keeps annotations on an in-page navigation', () => {
    const harness = createHarness('https://example.com/report')

    harness.navigation.handleDidStartNavigation({
      isMainFrame: true,
      isInPlace: true,
      url: 'https://example.com/other'
    } as Electron.DidStartNavigationEvent)

    expect(harness.invalidateBrowserAnnotationDocument).not.toHaveBeenCalled()
  })
})
