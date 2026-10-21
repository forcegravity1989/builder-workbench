import type { Worktree } from '../../../shared/worktree/types'
import type { Repo } from '../../../shared/repo-types'
import {
  normalizeTaskSourceContext,
  type TaskSourceContext
} from '../../../shared/task-source-context'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import type { WorkbenchTaskScope } from '../../../shared/workbench/task-scope'
import { findVersionTaskWorktrees } from '../../../shared/workbench/version-workspace-match'
import { findGithubWorkItemWorkspaceAttachment } from '@/lib/github-work-item-workspace-attachment'

/**
 * G2 统一 Start/Open 解析的渲染端入口（P4）：仅 BW 范围路径把「首个未归档树」
 * 语义替换为按绑定精确解析；无范围时返回 null，调用方保持原生语义逐字不变。
 * 唯一 → 直开；多候选 → 交选择器（绝不取数组第一棵）；无 → Start。
 */

export type ScopedTaskWorkspaceMatch<T extends Worktree = Worktree> =
  | { kind: 'none'; candidates: readonly T[] }
  | { kind: 'unique'; candidates: readonly [T] }
  | { kind: 'choice'; candidates: readonly T[] }

export function matchScopedTaskWorkspaces<T extends Worktree>(args: {
  scope: WorkbenchTaskScope | null
  worktrees: readonly T[]
  provider: 'github' | 'codehub'
  number: number
  /** 完整任务来源身份；缺失时按 provider+编号匹配，多命中即多候选，不猜。 */
  sourceContext: TaskSourceContext | null
}): ScopedTaskWorkspaceMatch<T> | null {
  const { scope, worktrees, provider, number, sourceContext } = args
  if (!scope) {
    return null
  }
  const candidates = findVersionTaskWorktrees(worktrees, {
    version: scope.version,
    number,
    source: sourceContext,
    provider
  })
  if (candidates.length === 0) {
    return { kind: 'none', candidates }
  }
  if (candidates.length === 1) {
    return { kind: 'unique', candidates: [candidates[0] as T] }
  }
  return { kind: 'choice', candidates }
}

/** CodeHub 行的任务来源身份（与原生创建器预填同一构造，不另造第二种）。 */
export function codeHubTaskSourceContext(
  repo: Repo | undefined | null,
  item: { repoId?: string | null; host?: string | null; project?: string | null }
): TaskSourceContext | null {
  return normalizeTaskSourceContext({
    provider: 'codehub',
    projectId: repo?.id ?? item.repoId ?? '',
    hostId: repo ? getRepoExecutionHostId(repo) : 'local',
    repoId: item.repoId,
    providerIdentity: {
      provider: 'codehub',
      host: item.host ?? null,
      project: item.project ?? null
    }
  })
}

/**
 * 任务行的 Open/Start 判定（Rows / CodeHub ItemList 共用）：范围视图的 Issue
 * 按绑定解析；PR 行与无范围视图回落原生「首个未归档树」附件语义，逐字不变。
 * attached=唯一直开对象；hasWorkspace=按钮呈 Open 还是 Start（多候选也呈 Open，
 * 点击进选择器）。
 */
export function resolveTaskRowWorkspace<T extends Worktree>(args: {
  scope: WorkbenchTaskScope | null
  worktrees: readonly T[]
  provider: 'github' | 'codehub'
  item: { repoId?: string | null; type: string; number: number }
  sourceContext: TaskSourceContext | null
}): { attached: T | null; hasWorkspace: boolean } {
  const { scope, worktrees, provider, item, sourceContext } = args
  if (scope && item.type === 'issue') {
    const match = matchScopedTaskWorkspaces({
      scope,
      worktrees,
      provider,
      number: item.number,
      sourceContext
    })
    if (match) {
      return {
        attached: match.kind === 'unique' ? (match.candidates[0] as T) : null,
        hasWorkspace: match.candidates.length > 0
      }
    }
  }
  if (provider !== 'github') {
    // 原生 CodeHub 行不呈现附件状态；无范围时保持 Start 语义。
    return { attached: null, hasWorkspace: false }
  }
  const attached = findGithubWorkItemWorkspaceAttachment(
    worktrees,
    item.repoId,
    item.type === 'pr' ? 'pr' : 'issue',
    item.number
  ) as T | null
  return { attached, hasWorkspace: attached !== null }
}
