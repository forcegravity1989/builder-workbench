import { useAppStore } from '@/store'
import { branchName } from '@/lib/git-utils'
import { sendNotesToActiveAgentSession } from '@/lib/active-agent-note-send'
import { deriveNotesSendAgentTargets } from '@/lib/notes-send-agent-targets'
import type { ActiveAgentNotesSendStatus } from '@/lib/active-agent-note-send-result'
import { METRICS_BRANCH } from './version-cycle/metrics-setup'

export function metricsMaintenanceWorktreeId(): string | null {
  const state = useAppStore.getState()
  const repoId = state.activeRepoId
  const trees = repoId ? state.worktreesByRepo[repoId] : undefined
  return (
    trees?.find((tree) => tree.branch && branchName(tree.branch) === METRICS_BRANCH)?.id ?? null
  )
}

/** The metrics workspace session: its active tab when that tab can take input, otherwise the only eligible one. */
export function metricsSessionTarget(worktreeId: string): { tabId: string; leafId: string } | null {
  const state = useAppStore.getState()
  const targets = deriveNotesSendAgentTargets(state, worktreeId)
  const eligible = targets.filter((target) => target.status === 'eligible')
  const choices = eligible.length ? eligible : targets
  if (!choices.length) {
    return null
  }
  const activeTab = state.activeTabIdByWorktree[worktreeId]
  const target = choices.find((item) => item.tabId === activeTab) ?? choices[0]
  return { tabId: target.tabId, leafId: target.leafId }
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
    case 'partial-submit-failed':
      return '批注可能已经贴进指标配置会话，但没有提交成功。'
  }
}

export async function sendScoreboardNotes(
  prompt: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const worktreeId = metricsMaintenanceWorktreeId()
  const target = worktreeId ? metricsSessionTarget(worktreeId) : null
  if (!worktreeId || !target) {
    return { ok: false, message: scoreboardSendFailure('no-active-terminal') }
  }
  const state = useAppStore.getState()
  state.setActiveWorktree(worktreeId)
  state.setActiveView('terminal')
  state.setActiveTab(target.tabId)
  const result = await sendNotesToActiveAgentSession({
    worktreeId,
    prompt,
    noteTarget: target
  })
  if (result.status === 'sent') {
    return { ok: true }
  }
  return { ok: false, message: scoreboardSendFailure(result.status) }
}
