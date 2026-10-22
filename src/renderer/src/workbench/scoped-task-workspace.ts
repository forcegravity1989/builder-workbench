import type { Worktree } from '../../../shared/worktree/types'
import type { Repo } from '../../../shared/repo-types'
import {
  normalizeTaskSourceContext,
  type TaskSourceContext
} from '../../../shared/task-source-context'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { toast } from 'sonner'
import type { WorkbenchTaskScope } from '../../../shared/workbench/task-scope'
import {
  findVersionGoalWorktrees,
  findVersionTaskWorktrees
} from '../../../shared/workbench/version-workspace-match'
import { findGithubWorkItemWorkspaceAttachment } from '@/lib/github-work-item-workspace-attachment'
import { openWorkbenchWorkspaceChoice } from './version-workspace-choice-state'

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
  /** 完整任务来源身份；缺失时按 provider+编号+仓库匹配，多命中即多候选，不猜。 */
  sourceContext: TaskSourceContext | null
  repoId?: string | null
}): ScopedTaskWorkspaceMatch<T> | null {
  const { scope, worktrees, provider, number, sourceContext, repoId } = args
  if (!scope) {
    return null
  }
  const candidates = findVersionTaskWorktrees(worktrees, {
    version: scope.version,
    number,
    source: sourceContext,
    provider,
    ...(repoId ? { repoId } : {})
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
      sourceContext,
      repoId: item.repoId
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

// 解析核在共享模块（协议单测看护）；此处转发保持 BW 单一导入面。
export {
  findGoalParentSuggestion,
  findVersionTaskWorktrees
} from '../../../shared/workbench/version-workspace-match'

/** 范围解析出的工作区激活失败时的如实提示（文案住 BW 模块，原生文件不引新词条）。 */
export function notifyScopedWorkspaceUnavailable(): void {
  toast.error('无法打开本版绑定的工作区，请在原生项目工作区中核对。')
}

/**
 * 打开目标工作区（侧栏目标菜单「打开工作区」）：唯一 → 直开；多候选 → 选择器；
 * 无 → false（调用方转「目标开工」）。不取数组第一棵。
 */
export function openGoalWorkspace(args: {
  version: string
  goalId: string
  /** 选择器标题用的展示名（如「G2 · 目标句」）；业务身份只认 goalId。 */
  label?: string
  worktrees: readonly Worktree[]
}): boolean {
  const candidates = findVersionGoalWorktrees(args.worktrees, {
    version: args.version,
    goalId: args.goalId
  })
  if (candidates.length === 0) {
    return false
  }
  if (candidates.length === 1) {
    const only = candidates[0]
    if (!only) {
      return false
    }
    if (activateAndRevealWorktree(only.id) === false) {
      toast.error('无法打开目标工作区，请在原生项目工作区中核对。')
    }
    return true
  }
  openWorkbenchWorkspaceChoice({
    title: `目标 ${args.label ?? args.goalId}`,
    candidates: [...candidates]
  })
  return true
}
