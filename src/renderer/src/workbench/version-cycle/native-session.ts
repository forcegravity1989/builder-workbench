import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import {
  insertNativeChatDraft,
  insertNativeChatDraftForTab
} from '@/lib/native-chat-draft-insertion'
import { structuredAgentSessionPaneKey } from '../../../../shared/structured-agent-session-projection'
import { makePaneKey, isTerminalLeafId } from '../../../../shared/stable-pane-id'
import { resolveRootlessTerminalLayoutLeafId } from '@/components/terminal-pane/terminal-layout-leaf-ids'
import type { CycleScope, CycleSession } from './ports'
import { cycleScopeForWorktree, cycleScopeKey } from './native-cycle-workspace'

/** Only project/host identity and the currently focused native composer cross into BW. */
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

export async function prepareCycleRequest(session: CycleSession, text: string) {
  const current = getActiveCycleSession(useAppStore.getState(), session, session.worktreeId)
  if (!current || current.tabId !== session.tabId) {
    throw new Error('会话焦点已改变，请选择目标会话后重试。')
  }
  const exact =
    current.paneKey != null &&
    insertNativeChatDraft({ tabId: current.tabId, paneKey: current.paneKey, text })
  if (exact || insertNativeChatDraftForTab(current.tabId, text)) {
    return
  }
  throw new Error('请先切换到此会话的聊天输入框，再准备请求')
}
