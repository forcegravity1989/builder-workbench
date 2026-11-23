import type { TerminalTabCloseIntent } from '../terminal/terminal-tab-close-intent'
export type TerminalPaneProps = {
  tabId: string
  worktreeId: string
  cwd?: string
  isActive: boolean
  isVisible?: boolean
  isWorktreeActive?: boolean
  // Activity portals can isolate one split without changing expanded state or persistence.
  isolatedPaneKey?: string | null
  // Why: one-off command terminals keep split shortcuts but hide the prominent header button.
  showSplitButton?: boolean
  onPtyExit: (ptyId: string, exitCode?: number) => void
  /** Closing the tab's last pane closes the tab; the caller names who asked. */
  onCloseTab: (reason: TerminalTabCloseIntent) => void
}

export type TerminalPaneHandle = {
  closeActivePane: () => void
}
