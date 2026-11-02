import {
  findAmbiguousWorktreeIds,
  getPaletteOwnershipWorktreeIds,
  isUnifiedTabOwnedByWorktree
} from '@/lib/unified-tab-host-ownership'
import type { Worktree } from '../../../shared/worktree/types'
import { useAppStore } from '@/store'
import { sendMessageToAgent } from '@/lib/agent-message-send'
import type { AgentMessageTarget } from '@/lib/agent-message-target'
import { getStructuredChatTabNames } from '@/runtime/structured-chat-name-observation'
import { deriveNotesSendAgentTargets } from '@/lib/notes-send-agent-targets'
import type { ActiveAgentNotesSendStatus } from '@/lib/active-agent-note-send-result'
import { METRICS_BRANCH } from './version-cycle/metrics-setup'
import { findNamedWorktree, nativeWorkspaceScope } from './version-cycle/native-workspace'

function metricsMaintenanceWorktree(source: Worktree | null) {
  return source ? findNamedWorktree(nativeWorkspaceScope(source), METRICS_BRANCH) : null
}

/** The metrics workspace session: its active tab when that tab can take input, otherwise the only eligible one. */
export function metricsSessionTarget(
  worktree: Worktree
): { tabId: string; messageTarget: AgentMessageTarget } | null {
  const state = useAppStore.getState()
  const worktreeId = worktree.id
  const ambiguous = findAmbiguousWorktreeIds(getPaletteOwnershipWorktreeIds(state))
  const tabs = state.unifiedTabsByWorktree[worktreeId] ?? []
  const targets = deriveNotesSendAgentTargets(
    state,
    worktreeId,
    getStructuredChatTabNames()
  ).filter((target) => {
    const tab = tabs.find((tab) =>
      target.messageTarget.kind === 'terminal'
        ? tab.contentType === 'terminal' && tab.entityId === target.tabId
        : tab.id === target.tabId
    )
    return isUnifiedTabOwnedByWorktree(tab, worktree, ambiguous)
  })
  const eligible = targets.filter((target) => target.status === 'eligible')
  const choices = eligible.length ? eligible : targets
  if (!choices.length) {
    return null
  }
  const activeGroupId = state.activeGroupIdByWorktree[worktreeId]
  const group = state.groupsByWorktree[worktreeId]?.find((entry) => entry.id === activeGroupId)
  const tab = state.unifiedTabsByWorktree[worktreeId]?.find(
    (entry) => entry.id === group?.activeTabId
  )
  const activeTab = tab?.contentType === 'terminal' ? tab.entityId : tab?.id
  const target =
    choices.find((item) => item.tabId === activeTab) ?? (choices.length === 1 ? choices[0] : null)
  return target ? { tabId: target.tabId, messageTarget: target.messageTarget } : null
}

export function scoreboardSendFailure(status: Exclude<ActiveAgentNotesSendStatus, 'sent'>): string {
  switch (status) {
    case 'empty':
      return '没有可发送的批注。'
    case 'no-active-terminal':
    case 'no-agent':
      return '还没有可接收的指标配置会话。先点「配置指标」打开会话，再发送。'
    case 'not-ready':
      return '指标配置会话还不能接收，等它空闲后再发送。'
    case 'permission':
      return '指标配置会话正在等批准，批准后再发送。'
    case 'status-unavailable':
      return '读不到指标配置会话的状态，稍后再发送。'
    case 'not-writable':
      return '指标配置会话没有收下批注。'
    case 'unconfirmed':
      return '批注已发出，但无法确认指标配置会话是否收到，请先检查会话。'
    case 'partial-submit-failed':
      return '批注可能已经贴进指标配置会话，但没有提交成功。'
  }
}

export async function sendScoreboardNotes(
  prompt: string,
  sourceWorktree: Worktree | null
): Promise<{ ok: true } | { ok: false; message: string }> {
  let worktree
  try {
    worktree = metricsMaintenanceWorktree(sourceWorktree)
  } catch {
    return { ok: false, message: scoreboardSendFailure('status-unavailable') }
  }
  const worktreeId = worktree?.id
  const target = worktree ? metricsSessionTarget(worktree) : null
  if (!worktree || !worktreeId || !target) {
    return { ok: false, message: scoreboardSendFailure('no-active-terminal') }
  }
  const state = useAppStore.getState()
  state.setActiveWorktree(worktreeId, nativeWorkspaceScope(worktree).hostId)
  state.setActiveView('terminal')
  if (target.messageTarget.kind === 'terminal') {
    state.setActiveTab(target.tabId)
  } else {
    state.activateTab(target.tabId, { worktreeId })
  }
  const result = await sendMessageToAgent({
    worktreeId,
    prompt,
    target: target.messageTarget
  })
  if (result.status === 'sent') {
    return { ok: true }
  }
  return { ok: false, message: scoreboardSendFailure(result.status) }
}
