import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { pasteDraftToAgentPtyWhenReady } from '@/lib/agent-paste-draft'
import { structuredAgentSessionPaneKey } from '../../../../shared/structured-agent-session-projection'
import { makePaneKey, isTerminalLeafId, parsePaneKey } from '../../../../shared/stable-pane-id'
import { resolveRootlessTerminalLayoutLeafId } from '@/components/terminal-pane/terminal-layout-leaf-ids'
import type { CycleScope, CycleSession } from './ports'
import { cycleScopeForWorktree, cycleScopeKey } from './native-cycle-workspace'

/** The session shown on the left is the only target for a cycle request. */
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

/** Unsent paste into the leaf on screen. Later requests must paste even when the agent prefills only at launch. */
async function pasteDraftIntoVisibleTerminal(
  state: AppState,
  current: CycleSession,
  text: string
): Promise<boolean> {
  const leafId = current.paneKey ? parsePaneKey(current.paneKey)?.leafId : undefined
  const layout = state.terminalLayoutsByTabId[current.tabId]
  const ptyId =
    (leafId && layout?.ptyIdsByLeafId?.[leafId]) || state.ptyIdsByTabId[current.tabId]?.[0]
  if (!ptyId) {
    return false
  }
  const terminal = state.tabsByWorktree[current.worktreeId]?.find(
    (item) => item.id === current.tabId
  )
  return pasteDraftToAgentPtyWhenReady({
    tabId: current.tabId,
    ptyId,
    content: text,
    agent: terminal?.launchAgent,
    submit: false,
    forcePaste: true
  })
}

export async function prepareCycleRequest(session: CycleSession, text: string) {
  const state = useAppStore.getState()
  const current = getActiveCycleSession(state, session, session.worktreeId)
  if (!current || current.tabId !== session.tabId || current.paneKey !== session.paneKey) {
    throw new Error('会话焦点已改变，请选择目标会话后重试。')
  }
  if (current.kind === 'terminal' && (await pasteDraftIntoVisibleTerminal(state, current, text))) {
    return
  }
  throw new Error('无法把请求写入左侧当前会话，请确认该会话仍打开后重试。')
}
