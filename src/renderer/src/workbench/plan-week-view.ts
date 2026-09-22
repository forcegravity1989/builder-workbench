import type { PlanningGoal, PlanningSession, PlanningTask } from './plan-week-document'

export const GOAL_RESULT_OPTIONS = ['达成', '未达', '遗留', '无值'] as const
export const GOAL_RESULT_TONES: Record<string, string> = {
  达成: 'success',
  未达: 'danger',
  遗留: 'warning',
  无值: 'neutral'
}

export function goalProgressWidth(goal: PlanningGoal): number | null {
  const n = goal.progress
  if (typeof n !== 'number' || n < 0 || n > 100) {
    return null
  }
  if (!goal.metric.trim() || !goal.target.trim() || !goal.reading.trim()) {
    return null
  }
  return n
}

export function visibleResultTasks(tasks: readonly PlanningTask[]): PlanningTask[] {
  return tasks.filter((task) => String(task.number ?? '').trim().length > 0)
}

export function visibleSessions(sessions: readonly PlanningSession[]): PlanningSession[] {
  return sessions.filter((session) => Object.hasOwn(session, 'title'))
}

export function minutesStatusLabel(state: string, markdown: string): string {
  if (state === 'stale') {
    return '材料已更新 · 请核对纪要'
  }
  if (markdown.trim()) {
    return '已有纪要 · 可继续修改'
  }
  return '待填写'
}
