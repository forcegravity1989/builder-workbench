/**
 * Determine which zoom domain (terminal, editor, simulator, or UI) should be adjusted
 * based on current view, tab type, and focused element.
 */
export function resolveZoomTarget(args: {
  activeView: TopLevelView
  activeTabType: WorkspaceVisibleTabType
  activeElement: unknown
}): 'terminal' | 'editor' | 'simulator' | 'browser' | 'ui' {
  const { activeView, activeTabType, activeElement } = args
  const terminalInputFocused =
    typeof activeElement === 'object' &&
    activeElement !== null &&
    'classList' in activeElement &&
    typeof (activeElement as { classList?: { contains?: unknown } }).classList?.contains ===
      'function' &&
    (activeElement as { classList: { contains: (token: string) => boolean } }).classList.contains(
      'xterm-helper-textarea'
    )
  const editorFocused =
    typeof activeElement === 'object' &&
    activeElement !== null &&
    'closest' in activeElement &&
    typeof (activeElement as { closest?: unknown }).closest === 'function' &&
    Boolean(
      (
        activeElement as {
          closest: (selector: string) => Element | null
        }
      ).closest(
        '.monaco-editor, .diff-editor, .markdown-preview, .rich-markdown-editor, .rich-markdown-editor-shell'
      )
    )

  if (focusedBrowserPageId(activeElement)) {
    return 'browser'
  }
  if (activeView !== 'terminal') {
    return 'ui'
  }
  if (activeTabType === 'simulator') {
    return 'simulator'
  }
  // With focus outside the pane, the chord belongs to the application.
  if (activeTabType === 'browser') {
    return 'ui'
  }
  if (activeTabType === 'editor' || editorFocused) {
    return 'editor'
  }
  // Why: terminal zoom is focus-owned. After the user clicks app chrome or
  // whitespace, the active terminal tab remains visible but app zoom should own
  // Cmd/Ctrl +/- until xterm focus returns.
  if (terminalInputFocused) {
    return 'terminal'
  }
  return 'ui'
}
import type { TopLevelView } from '../../../shared/ui-chrome-types'
import type { WorkspaceVisibleTabType } from '../../../shared/tab-types'

function closestFocusedElement(element: unknown, selector: string): unknown {
  if (
    typeof element === 'object' &&
    element !== null &&
    'closest' in element &&
    typeof element.closest === 'function'
  ) {
    return element.closest(selector)
  }
  return null
}

const BROWSER_PAGE_ID_ATTRIBUTES = [
  'data-browser-page-pane-id',
  'data-browser-page-viewport-id',
  'data-browser-page-menu-id'
]

/** Resolve browser page focus from page, address bar/toolbar or external menu, which may live outside the pane. */
export function focusedBrowserPageId(activeElement: unknown): string | null {
  for (const attribute of BROWSER_PAGE_ID_ATTRIBUTES) {
    const owner = closestFocusedElement(activeElement, `[${attribute}]`)
    if (
      typeof owner === 'object' &&
      owner !== null &&
      'getAttribute' in owner &&
      typeof owner.getAttribute === 'function'
    ) {
      const browserPageId: unknown = owner.getAttribute(attribute)
      return typeof browserPageId === 'string' ? browserPageId : null
    }
  }
  return null
}
