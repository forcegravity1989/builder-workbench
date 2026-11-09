import { branchName } from '@/lib/git-utils'
import { normalizeStoredWorkbenchVersionBinding } from '../../../shared/workbench/version-binding'
import {
  LEGACY_ACCEPTANCE_BRANCH,
  LEGACY_PLAN_BRANCH
} from '../../../shared/workbench/version-workspace-prepare'
import type { Worktree } from '../../../shared/worktree/types'

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
