import type {
  PlanningMaterial,
  MetricReadingEvidence,
  MetricReference
} from '../../../../shared/workbench/version-material'

export function sameMetricReference(a: MetricReference, b: MetricReference): boolean {
  return (
    a.name === b.name &&
    a.definitionHash === b.definitionHash &&
    a.configurationCommit === b.configurationCommit
  )
}

/** Readers provide current, verified evidence. A saved baseline is not a current reading. */
export function derivePlanMinutes(
  plan: PlanningMaterial,
  readings: readonly MetricReadingEvidence[] = []
): string {
  const goals = plan.goals.map((goal, index) => `${index + 1}. ${goal.title.trim() || '待明确'}`)
  const deliveries = plan.goals.map(
    (goal, index) =>
      `- G${index + 1}：${goal.deliverable?.trim() || '交付件待明确'}${goal.acceptance?.trim() ? `；验收：${goal.acceptance.trim()}` : ''}`
  )
  const metrics = plan.goals.flatMap((goal, index) =>
    goal.metricTargets.map((target) => {
      const reading = readings.find((item) => sameMetricReference(item.ref, target.ref))
      return `- G${index + 1} · ${target.ref.name}：当前 ${reading ? `${reading.value}${reading.unit}` : '待核'} → 版本目标 ${target.target.trim() || '待明确'}${reading ? `（${reading.collectedAt}；${reading.source}）` : '（目标草案，尚无可信采集）'}`
    })
  )
  return [
    '## 本周 Top3 目标',
    ...(goals.length ? goals : ['待明确']),
    '',
    '## 周五交付件',
    ...(deliveries.length ? deliveries : ['- 待明确']),
    '',
    '## 数字指标变化',
    ...(metrics.length ? metrics : ['- 未约定指标'])
  ].join('\n')
}

export function derivePlanSummary(
  plan: PlanningMaterial,
  readings: readonly MetricReadingEvidence[] = []
) {
  return {
    version: plan.version,
    cycleId: plan.cycleId,
    progress: plan.summary.progress,
    risks: plan.summary.risks,
    goals: plan.goals.map((goal) => ({
      goalId: goal.goalId,
      title: goal.title,
      deliverable: goal.deliverable ?? ''
    })),
    taskCount: plan.tasks.length,
    minutes: derivePlanMinutes(plan, readings)
  }
}
