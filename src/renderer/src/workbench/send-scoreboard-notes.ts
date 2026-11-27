import { useAppStore } from '@/store'
import { sendMessageToAgent } from '@/lib/agent-session/messaging/agent-message-send'
import { getStructuredChatTabNames } from '@/runtime/native-chat/naming/structured-chat-name-observation'
import type { NotesSendAgentTarget } from '@/lib/agent-session/messaging/notes-send-agent-targets'
import { deriveNotesSendAgentTargets } from '@/lib/agent-session/messaging/notes-send-agent-targets'
import type { ActiveAgentNotesSendStatus } from '@/lib/agent-session/messaging/terminal/active-agent-note-send-result'
import { findNamedWorktree, type NativeWorkspaceScope } from './version-cycle/native-workspace'
import { worktreeActivationHostOpts } from './worktree-activation-host-opts'
import { activateAndRevealWorktree } from '@/lib/workspace/activation/worktree-activation'
import { METRICS_BRANCH } from './version-cycle/metrics-setup'

/** The metrics workspace session: its active tab when that tab can take input, otherwise the only eligible one. */
export function metricsSessionTarget(worktreeId: string): NotesSendAgentTarget | null {
  const state = useAppStore.getState()
  const targets = deriveNotesSendAgentTargets(state, worktreeId, getStructuredChatTabNames())
  const eligible = targets.filter((target) => target.status === 'eligible')
  const choices = eligible.length ? eligible : targets
  if (!choices.length) {
    return null
  }
  const activeTab = state.activeTabIdByWorktree[worktreeId]
  const target = choices.find((item) => item.tabId === activeTab) ?? choices[0]
  return target
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
    case 'approval-unseen':
      return '暂时无法确认指标配置会话是否在等批准，请查看会话后再发送。'
    case 'host-update-required':
      return '请先更新指标配置会话所在的主机，再发送批注。'
    case 'status-unavailable':
      return '读不到指标配置会话的状态，稍后再发送。'
    case 'not-writable':
      return '指标配置会话没有收下批注。'
    case 'partial-submit-failed':
      return '批注可能已经贴进指标配置会话，但没有提交成功。'
    case 'unconfirmed':
      return '批注已发送，但尚未确认会话是否收到，请先查看会话。'
  }
}

export async function sendScoreboardNotes(
  scope: NativeWorkspaceScope | null,
  prompt: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const worktree = scope ? findNamedWorktree(scope, METRICS_BRANCH) : null
  const worktreeId = worktree?.id
  const target = worktreeId ? metricsSessionTarget(worktreeId) : null
  if (!worktree || !worktreeId || !target) {
    return { ok: false, message: scoreboardSendFailure('no-active-terminal') }
  }
  const state = useAppStore.getState()
  if (!activateAndRevealWorktree(worktreeId, worktreeActivationHostOpts(worktree))) {
    return { ok: false, message: scoreboardSendFailure('no-active-terminal') }
  }
  state.setActiveTab(target.tabId)
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
