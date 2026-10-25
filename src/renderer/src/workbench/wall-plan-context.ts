import type { Worktree } from '../../../shared/worktree/types'
import { normalizeStoredWorkbenchVersionBinding } from '../../../shared/workbench/version-binding'
import { nativeWorkspaceScope, type NativeWorkspaceScope } from './version-cycle/native-workspace'
import { findCycleWorktree } from './version-cycle/native-cycle-workspace'
import type { WallProject } from './workbench-wall-projects'

/**
 * 墙卡版本/进展读数的计划树上下文解析（G2 P5/R9 从 wall-readings-load 拆出，
 * 语义与判据见 resolvePlanContext 注释）。
 */

export type PlanContext = {
  scope: NativeWorkspaceScope
  home: Worktree
  plan: Worktree
}

/**
 * 在项目各注册行里找计划固定树上下文。G2（P5/R9）：绑定计划树优先——版本由
 * 绑定单一决定，先跨全部注册行聚合绑定版本：恰一个绑定版本时以该树为正本；
 * 多个在制版本并存时卡片单一版本读数没有唯一正本，如实 null（版本未定），
 * 不猜、不回落旧偏好。无绑定树时沿旧语义：主工作树 + bw/week-plan 固定树。
 * 活跃仓行优先（与总览活跃上下文同源），再本机在前：同一项目两屏读同一注册行，
 * 版本不产生分叉。宿主路由不明确或同分支多工作树的行如实跳过；全部行都解析不出
 * → null（版本行显示「版本未定」——没选过版与判据不可证都不猜）。
 */
export function resolvePlanContext(
  project: WallProject,
  worktreesByRepo: Record<string, readonly Worktree[]>,
  activeRepoId: string | null
): PlanContext | null {
  const ordered =
    activeRepoId && project.rows.some((row) => row.id === activeRepoId)
      ? [
          ...project.rows.filter((row) => row.id === activeRepoId),
          ...project.rows.filter((row) => row.id !== activeRepoId)
        ]
      : project.rows
  const rowContexts: {
    scope: NativeWorkspaceScope
    home: Worktree
    boundPlans: Worktree[]
  }[] = []
  for (const row of ordered) {
    const worktrees = worktreesByRepo[row.id] ?? []
    const home = worktrees.find((item) => item.isMainWorktree) ?? worktrees[0]
    if (!home) {
      continue
    }
    try {
      const scope = nativeWorkspaceScope(home)
      const boundPlans = worktrees.filter((tree) => {
        if (tree.isArchived) {
          return false
        }
        const binding = normalizeStoredWorkbenchVersionBinding(tree.workbenchVersionBinding)
        return binding !== null && binding.workflow === 'plan'
      })
      rowContexts.push({ scope, home, boundPlans })
    } catch {
      // 该行宿主/登记不明确：换下一行，不冒充。
    }
  }
  const boundVersions = new Set<string>()
  for (const context of rowContexts) {
    for (const tree of context.boundPlans) {
      const binding = normalizeStoredWorkbenchVersionBinding(tree.workbenchVersionBinding)
      if (binding) {
        boundVersions.add(binding.version)
      }
    }
  }
  if (boundVersions.size > 1) {
    return null
  }
  if (boundVersions.size === 1) {
    const context = rowContexts.find((item) => item.boundPlans.length > 0)
    const plan = context?.boundPlans[0]
    if (context && plan) {
      return { scope: context.scope, home: context.home, plan }
    }
  }
  for (const context of rowContexts) {
    const plan = findCycleWorktree({ ...context.scope, workflow: 'plan' })
    if (plan) {
      return { scope: context.scope, home: context.home, plan }
    }
  }
  return null
}
