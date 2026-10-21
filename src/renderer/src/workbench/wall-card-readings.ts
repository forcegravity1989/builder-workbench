import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import { isFreshNonDoneAgentStatus } from '../../../shared/agent-status-types'
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

/** 墙卡计数用的任务状态回执：只问开/关，平台中立（GitHub state、CodeHub opened/closed/merged 映射为同一形状）。 */
export type WallTaskState = { state: 'OPEN' | 'CLOSED' }

export type CommitmentProgress = {
  completed: number
  open: number
}

export type CommitmentTask = { provider: string; repository: string; number: number }

/**
 * 承诺进展 = 该版本 tasks × Issue 原生状态。
 * 口径（负责人决策 2026-10-16，spec 承诺进展行）：关闭即计完成、开放即计开放，
 * 关闭原因不参与计数——duplicate/not_planned 关闭同样计入完成，不正当关闭归
 * 关闭者，读数只如实计关闭事实。全有或全无：任一任务缺状态回执 → null，
 * 界面显示「—」，不拼半真数字。provider 准入（GitHub/CodeHub）由读取管线
 * 把关，本函数只看回执。
 */
export function deriveCommitmentProgress(
  tasks: readonly CommitmentTask[],
  states: ReadonlyMap<string, WallTaskState | undefined>
): CommitmentProgress | null {
  const progress: CommitmentProgress = { completed: 0, open: 0 }
  for (const task of tasks) {
    const entry = states.get(issueStateKey(task.repository, task.number))
    if (!entry) {
      return null
    }
    if (entry.state === 'OPEN') {
      progress.open += 1
    } else {
      progress.completed += 1
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
