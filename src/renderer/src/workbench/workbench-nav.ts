/**
 * Workbench left-nav ids. Surfaces reuse existing Orca TopLevelView slots
 * so we do not extend the upstream union (see SYNC.md).
 *
 * 计划 → artifacts（Orca Artifacts 入口在壳里已收起）
 * 任务 → tasks（完整 TaskPage）
 */
export type WorkbenchNavId = 'overview' | 'plan' | 'tasks' | 'automations' | 'knowledge'

export const WORKBENCH_PLAN_SLOT = 'artifacts' as const

export function resolveWorkbenchNav(activeView: string): WorkbenchNavId | null {
  if (activeView === 'terminal') {
    return null
  }
  if (activeView === 'activity') {
    return 'overview'
  }
  if (activeView === WORKBENCH_PLAN_SLOT) {
    return 'plan'
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
