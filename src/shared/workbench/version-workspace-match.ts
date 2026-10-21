import type { Worktree } from '../worktree/types'
import type { TaskSourceContext } from '../task-source-context'
import { areTaskSourceContextsEqual } from '../task-source-context'
import { isWorkspaceLinkedItemSourceContextMatch } from '../workspace-linked-item-source-context'
import { normalizeStoredWorkbenchVersionBinding } from './version-binding'

/**
 * G2 统一 Start/Open 解析的匹配核（P4）：按「完整来源 + owner + version + 明确
 * 绑定」在原生登记集合里找候选工作树。纯函数，不取数组第一棵——返回全部证明
 * 成立的候选，唯一/多候选/无候选的处置由调用方决定（design「复用必须覆盖 UI
 * 和调用链」：同 Issue 跨版时不得打开错误工作区）。
 *
 * 归属只认登记上的绑定与原生 linked 字段，不从分支名、目录名或标题反推。
 */

export type VersionTaskMatchQuery = {
  version: string
  /** 任务编号沿原生 linked 字段（绑定契约不重复存编号）。 */
  number: number
  /** 完整任务来源身份；缺失时按 provider+编号匹配，多来源命中即多候选，不猜。 */
  source?: TaskSourceContext | null
  provider?: string | null
}

export type VersionGoalMatchQuery = {
  version: string
  goalId: string
}

type MatchableWorktree = Pick<
  Worktree,
  'id' | 'isArchived' | 'linkedWorkItem' | 'workbenchVersionBinding'
>

function taskNumberMatches(tree: MatchableWorktree, query: VersionTaskMatchQuery): boolean {
  const linked = tree.linkedWorkItem
  if (!linked || linked.type !== 'issue' || linked.number !== query.number) {
    return false
  }
  if (query.source) {
    // 原生行可能缺显式 provider；沿写入路径同一推断（jira 需完整身份）。
    return isWorkspaceLinkedItemSourceContextMatch(linked, query.source)
  }
  return query.provider == null || linked.provider === query.provider
}

function taskSourceMatches(
  bindingSource: TaskSourceContext | undefined,
  query: VersionTaskMatchQuery
): boolean {
  if (!query.source) {
    // 查询没有完整来源时不拿绑定来源冒充证明；provider 一致即保留为候选。
    return query.provider == null || bindingSource?.provider === query.provider
  }
  if (!bindingSource) {
    return false
  }
  return areTaskSourceContextsEqual(bindingSource, query.source)
}

/**
 * Issue 执行树候选：绑定 (version, workflow=issue, taskSource) 与原生 linked
 * 编号同时证明成立。同号不同来源、同 Issue 两版由绑定身份自然区分。
 */
export function findVersionTaskWorktrees<T extends MatchableWorktree>(
  worktrees: readonly T[],
  query: VersionTaskMatchQuery
): T[] {
  const matches = worktrees.filter((tree) => {
    if (tree.isArchived) {
      return false
    }
    const binding = normalizeStoredWorkbenchVersionBinding(tree.workbenchVersionBinding)
    if (!binding || binding.workflow !== 'issue' || binding.version !== query.version) {
      return false
    }
    return taskNumberMatches(tree, query) && taskSourceMatches(binding.taskSource, query)
  })
  return matches.sort((a, b) => a.id.localeCompare(b.id))
}

/** 目标协作树候选：绑定 (version, workflow=goal, goalId) 证明成立；跨宿主实例一并返回。 */
export function findVersionGoalWorktrees<T extends MatchableWorktree>(
  worktrees: readonly T[],
  query: VersionGoalMatchQuery
): T[] {
  const matches = worktrees.filter((tree) => {
    if (tree.isArchived) {
      return false
    }
    const binding = normalizeStoredWorkbenchVersionBinding(tree.workbenchVersionBinding)
    return (
      !!binding &&
      binding.workflow === 'goal' &&
      binding.version === query.version &&
      binding.goalId === query.goalId
    )
  })
  return matches.sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * 流程树候选（plan/acceptance）：侧栏与开工解析共用同一绑定口径；
 * 已清理/未准备版本返回空集，由调用方走只读来源，不在此补树。
 */
export function findVersionFlowWorktrees<T extends MatchableWorktree>(
  worktrees: readonly T[],
  query: { version: string; workflow: 'plan' | 'acceptance' }
): T[] {
  const matches = worktrees.filter((tree) => {
    if (tree.isArchived) {
      return false
    }
    const binding = normalizeStoredWorkbenchVersionBinding(tree.workbenchVersionBinding)
    return !!binding && binding.workflow === query.workflow && binding.version === query.version
  })
  return matches.sort((a, b) => a.id.localeCompare(b.id))
}

export type GoalParentSuggestionWorktree = Pick<
  Worktree,
  | 'id'
  | 'isArchived'
  | 'linkedWorkItem'
  | 'workbenchVersionBinding'
  | 'repoId'
  | 'projectId'
  | 'hostId'
  | 'runtimeOwnerEnvironmentId'
>

/**
 * 父级建议（G2 P4③）：唯一合法的同项目同宿主目标树才建议在原生父级选择器
 * 预选；不唯一、跨项目/宿主或证明不足一律不建议、不预建。建议可改可取消，
 * 原生选择器与创建期校验仍是权威。
 */
export function findGoalParentSuggestion<T extends GoalParentSuggestionWorktree>(args: {
  version: string
  goalId: string
  worktrees: readonly T[]
  home: {
    repoId?: string | null
    projectId?: string | null
    hostId?: string | null
    runtimeOwnerEnvironmentId?: string | null
  }
}): string | null {
  const candidates = findVersionGoalWorktrees(args.worktrees, {
    version: args.version,
    goalId: args.goalId
  }).filter((tree) => {
    if (args.home.repoId && tree.repoId !== args.home.repoId) {
      return false
    }
    if (args.home.projectId && tree.projectId && tree.projectId !== args.home.projectId) {
      return false
    }
    if (args.home.hostId && tree.hostId && tree.hostId !== args.home.hostId) {
      return false
    }
    return !(
      tree.runtimeOwnerEnvironmentId &&
      args.home.runtimeOwnerEnvironmentId &&
      tree.runtimeOwnerEnvironmentId !== args.home.runtimeOwnerEnvironmentId
    )
  })
  return candidates.length === 1 ? (candidates[0]?.id ?? null) : null
}
