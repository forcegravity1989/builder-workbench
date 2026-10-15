import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import { isFreshNonDoneAgentStatus } from '../../../shared/agent-status-types'
import type { IssueStateEntry } from '../../../shared/github/issue-state-types'
import { resolveAgentStatusWorktreeId } from '../lib/agent-status-worktree-attribution'

/**
 * 墙卡读数推导（spec「墙卡读数」）：纯函数、全部现算，不落任何状态。
 * 三态纪律：有数据给真值；读不到给 Unknown；没版本给「版本未定」。
 * 不推导健康结论——判断归人（铁律二/三）。
 */

export type WallVersionReading =
  | { kind: 'loading' }
  | { kind: 'value'; version: string }
  | { kind: 'undecided' }

export type WallProgressReading =
  | { kind: 'loading' }
  | { kind: 'hidden' }
  | { kind: 'value'; completed: number; open: number }
  | { kind: 'unknown'; reason: string }

export type WallCountReading =
  | { kind: 'loading' }
  | { kind: 'value'; count: number }
  | { kind: 'unknown'; reason: string }

export type WallSessionReading = { kind: 'value'; count: number } | { kind: 'unknown' }

export type WallCardReadings = {
  version: WallVersionReading
  progress: WallProgressReading
  sessions: WallSessionReading
  prs: WallCountReading
}

export type GitHubRepoRef = { kind: 'github'; host: string; owner: string; repo: string }
export type TaskRepoRef = GitHubRepoRef | { kind: 'unsupported' }

/** 计划任务的 repository 字段（如 `github.com/owner/repo`）解析为平台坐标。 */
export function parseTaskRepository(repository: string): TaskRepoRef {
  const segments = repository.split('/')
  if (segments.length !== 3 || segments.some((segment) => !segment.trim())) {
    return { kind: 'unsupported' }
  }
  return { kind: 'github', host: segments[0], owner: segments[1], repo: segments[2] }
}

export const issueStateKey = (repository: string, number: number): string =>
  `${repository}#${number}`

export type CommitmentProgress = {
  completed: number
  open: number
  /** 决定不做/重复等其他关闭：不上卡，只供完整分解处使用。 */
  otherClosed: number
}

export type CommitmentTask = { provider: string; repository: string; number: number }

/**
 * 承诺进展 = 该版本 tasks × Issue 原生状态/关闭原因。
 * 全有或全无：任一任务读不到状态、或仓库非 GitHub（关闭原因不可读）→ null，
 * 界面显示「—」，不拼半真数字（spec 墙卡读数·承诺进展行）。
 */
export function deriveCommitmentProgress(
  tasks: readonly CommitmentTask[],
  states: ReadonlyMap<string, IssueStateEntry | undefined>
): CommitmentProgress | null {
  const progress: CommitmentProgress = { completed: 0, open: 0, otherClosed: 0 }
  for (const task of tasks) {
    if (task.provider !== 'github' || parseTaskRepository(task.repository).kind !== 'github') {
      return null
    }
    const entry = states.get(issueStateKey(task.repository, task.number))
    if (!entry) {
      return null
    }
    if (entry.state === 'OPEN') {
      progress.open += 1
    } else if (entry.stateReason === 'COMPLETED') {
      progress.completed += 1
    } else {
      progress.otherClosed += 1
    }
  }
  return progress
}

type TerminalLikeTab = { id: string }

/**
 * 在跑会话数：与侧栏/状态栏同一 live 口径（fresh 且非 done，
 * isFreshNonDoneAgentStatus + 同一归属函数），只是按会话条目计数、
 * 限定在给定工作树集合内（该项目的全部工作树）。
 */
export function countLiveAgentSessions(
  agentStatusByPaneKey: Record<string, AgentStatusEntry> | null | undefined,
  tabsByWorktree: Record<string, readonly TerminalLikeTab[]> | null | undefined,
  worktreeIds: ReadonlySet<string>,
  now: number
): number {
  const worktreeIdByTabId = new Map<string, string>()
  for (const [worktreeId, tabs] of Object.entries(tabsByWorktree ?? {})) {
    for (const tab of tabs) {
      worktreeIdByTabId.set(tab.id, worktreeId)
    }
  }
  let count = 0
  for (const entry of Object.values(agentStatusByPaneKey ?? {})) {
    if (!isFreshNonDoneAgentStatus(entry, now)) {
      continue
    }
    const worktreeId = resolveAgentStatusWorktreeId(entry, worktreeIdByTabId)
    if (worktreeId !== null && worktreeIds.has(worktreeId)) {
      count += 1
    }
  }
  return count
}

/**
 * 会话读数的离线规则（spec：离线 ≠ 0）：任一 runtime 来源主机连接事实
 * 不是「在线」时，计数不完整，整行 Unknown；本机/SSH 无 runtime 连接语义，
 * 不阻塞计数。全部可用时给真实计数（可为 0）。
 */
export function deriveSessionReading(
  runtimeHostsAllOnline: boolean,
  count: number
): number | 'unknown' {
  return runtimeHostsAllOnline ? count : 'unknown'
}
