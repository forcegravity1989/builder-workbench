import { makePaneKey, isTerminalLeafId } from '../../../../shared/stable-pane-id'
import type { TerminalLayoutSnapshot } from '../../../../shared/terminal-tab-types'
import { singlePaneLayoutSnapshot } from '@/store/slices/terminal-helpers'
import { mintStablePaneId } from '@/lib/pane-manager/mint-stable-pane-id'
import { resolveRootlessTerminalLayoutLeafId } from '@/components/terminal-pane/terminal-layout-leaf-ids'

/**
 * Generic terminal pane-layout helpers for embedding a chat into an existing tab.
 * Extracted from the legacy week-plan identity chain; no title/agent guessing lives here.
 */
export function resolveTerminalPaneKey(
  tabId: string,
  layout: TerminalLayoutSnapshot | undefined
): string | null {
  const leafId = leafIdFromLayout(layout)
  return leafId ? makePaneKey(tabId, leafId) : null
}

export function seedTerminalLayoutIfNeeded(
  tabId: string,
  layout: TerminalLayoutSnapshot | undefined
): { paneKey: string; snapshot: TerminalLayoutSnapshot | null } {
  const existing = resolveTerminalPaneKey(tabId, layout)
  if (existing) {
    return { paneKey: existing, snapshot: null }
  }
  const leafId = mintStablePaneId()
  return { paneKey: makePaneKey(tabId, leafId), snapshot: singlePaneLayoutSnapshot(leafId) }
}

function leafIdFromLayout(layout: TerminalLayoutSnapshot | undefined): string | null {
  if (!layout) {
    return null
  }
  if (layout.activeLeafId && isTerminalLeafId(layout.activeLeafId)) {
    return layout.activeLeafId
  }
  const rootless = resolveRootlessTerminalLayoutLeafId(layout)
  if (rootless) {
    return rootless
  }
  return layout.root?.type === 'leaf' && isTerminalLeafId(layout.root.leafId)
    ? layout.root.leafId
    : null
}
