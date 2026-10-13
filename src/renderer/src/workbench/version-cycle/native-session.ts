import type { AppState } from '@/store/types'
import { structuredAgentSessionPaneKey } from '../../../../shared/structured-agent-session-projection'
import { makePaneKey, isTerminalLeafId } from '../../../../shared/stable-pane-id'
import { resolveRootlessTerminalLayoutLeafId } from '@/components/terminal-pane/terminal-layout-leaf-ids'
import type { CycleScope, CycleSession } from './ports'
import { cycleScopeForWorktree, cycleScopeKey } from './native-cycle-workspace'

/** The session shown on the left, used only as navigation context (task detail return, board identity). */
export function getActiveCycleSession(
  state: AppState,
  scope: CycleScope | null,
  worktreeId: string | null
): CycleSession | null {
  if (!scope || !worktreeId || state.activeWorktreeId !== worktreeId) {
    return null
  }
  const worktree = state.getKnownWorktreeById(
    worktreeId,
    state.activeWorkspaceExecutionHostId ?? undefined
  )
  if (!worktree) {
    return null
  }
  try {
    if (cycleScopeKey(cycleScopeForWorktree(worktree, scope.workflow)) !== cycleScopeKey(scope)) {
      return null
    }
  } catch {
    return null
  }
  const tab = state.getActiveTab(worktreeId)
  if (tab?.contentType === 'agent-session') {
    return {
      ...scope,
      worktreeId,
      tabId: tab.id,
      sessionId: tab.entityId,
      paneKey: structuredAgentSessionPaneKey(tab.id, tab.entityId),
      kind: 'structured',
      title: tab.customLabel || tab.label
    }
  }
  if (tab && tab.contentType !== 'terminal') {
    return null
  }
  const tabId = tab?.entityId ?? state.activeTabId
  const terminal = state.tabsByWorktree[worktreeId]?.find((item) => item.id === tabId)
  if (!terminal) {
    return null
  }
  const layout = state.terminalLayoutsByTabId[terminal.id]
  const leafId = layout?.activeLeafId ?? (layout && resolveRootlessTerminalLayoutLeafId(layout))
  return {
    ...scope,
    worktreeId,
    tabId: terminal.id,
    sessionId: terminal.id,
    paneKey: leafId && isTerminalLeafId(leafId) ? makePaneKey(terminal.id, leafId) : undefined,
    kind: 'terminal',
    title: terminal.customTitle || terminal.title || '会话'
  }
}
