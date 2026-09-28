/**
 * Workbench left-nav ids. Surfaces reuse existing Orca TopLevelView slots
 * so we do not extend the upstream union (see SYNC.md).
 *
 * 计划/验收 → artifacts 准备固定树 → terminal 原生工作区旁挂业务板
 * 任务 → tasks（完整 TaskPage）
 */
import { getCycleView } from './cycle-view-state'
import type { Worktree } from '../../../shared/worktree/types'

export type WorkbenchNavId =
  | 'overview'
  | 'plan'
  | 'acceptance'
  | 'tasks'
  | 'automations'
  | 'knowledge'

export const WORKBENCH_PLAN_SLOT = 'artifacts' as const

/** Native fixed workspaces carry their business board across every entry point. */
export function cycleWorkflowForWorktree(worktree: Pick<Worktree, 'branch'> | null | undefined) {
  const branch = worktree?.branch?.replace(/^refs\/heads\//, '')
  return branch === 'bw/week-plan' ? 'plan' : branch === 'bw/week-acceptance' ? 'acceptance' : null
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
