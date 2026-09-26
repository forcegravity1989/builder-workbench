/**
 * Workbench left-nav ids. Surfaces reuse existing Orca TopLevelView slots
 * so we do not extend the upstream union (see SYNC.md).
 *
 * 计划/验收 → artifacts（Orca Artifacts 入口在壳里已收起；BW 子视图状态区分两屏）
 * 任务 → tasks（完整 TaskPage）
 */
import { getCycleView } from './cycle-view-state'

export type WorkbenchNavId =
  | 'overview'
  | 'plan'
  | 'acceptance'
  | 'tasks'
  | 'automations'
  | 'knowledge'

export const WORKBENCH_PLAN_SLOT = 'artifacts' as const

export function resolveWorkbenchNav(activeView: string): WorkbenchNavId | null {
  if (activeView === 'terminal') {
    return null
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
