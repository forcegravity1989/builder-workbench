/**
 * Workbench left-nav ids. Surfaces reuse existing Orca TopLevelView slots
 * so we do not extend the upstream union (see SYNC.md).
 *
 * 计划/验收 → artifacts 准备固定树 → terminal 原生工作区旁挂业务板
 * 任务 → tasks（完整 TaskPage）
 */
import { getCycleView } from './cycle-view-state'
import { branchName } from '@/lib/git-utils'
import { normalizeStoredWorkbenchVersionBinding } from '../../../shared/workbench/version-binding'
import {
  LEGACY_ACCEPTANCE_BRANCH,
  LEGACY_PLAN_BRANCH
} from '../../../shared/workbench/version-workspace-prepare'
import type { Worktree } from '../../../shared/worktree/types'

export type WorkbenchNavId =
  | 'overview'
  | 'plan'
  | 'acceptance'
  | 'tasks'
  | 'automations'
  | 'knowledge'

export const WORKBENCH_PLAN_SLOT = 'artifacts' as const

/**
 * 工作树的流程识别（G2 P3a）：绑定优先——已绑定树只按绑定点亮对应业务板
 * （目标/Issue 树不挂计划/验收板）；无绑定树沿旧固定分支语义（旧上下文显式
 * 保留，不强迫一次迁完）。分支字符串永远不是归属证明，只是旧路径的入口提示。
 */
export function cycleWorkflowForWorktree(
  worktree: Pick<Worktree, 'branch' | 'workbenchVersionBinding'> | null | undefined
) {
  const binding = normalizeStoredWorkbenchVersionBinding(worktree?.workbenchVersionBinding)
  if (binding) {
    return binding.workflow === 'plan'
      ? 'plan'
      : binding.workflow === 'acceptance'
        ? 'acceptance'
        : null
  }
  const branch = worktree?.branch ? branchName(worktree.branch) : undefined
  return branch === LEGACY_PLAN_BRANCH
    ? 'plan'
    : branch === LEGACY_ACCEPTANCE_BRANCH
      ? 'acceptance'
      : null
}

export function resolveWorkbenchNav(
  activeView: string,
  worktree?: Pick<Worktree, 'branch'> | null
): WorkbenchNavId | null {
  if (activeView === 'terminal') {
    return cycleWorkflowForWorktree(worktree)
  }
  if (activeView === 'activity') {
    return 'overview'
  }
  if (activeView === WORKBENCH_PLAN_SLOT) {
    return getCycleView() === 'acceptance' ? 'acceptance' : 'plan'
  }
  if (activeView === 'tasks') {
    return 'tasks'
  }
  if (activeView === 'automations') {
    return 'automations'
  }
  if (activeView === 'space') {
    return 'knowledge'
  }
  return null
}
