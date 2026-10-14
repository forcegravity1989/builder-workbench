import type {
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import type { DecisionFreshness } from './acceptance-decision'
import { emptyGoalResult } from './acceptance-model'
import { taskReferenceKey } from './acceptance-task-evidence'

const outcomeLabels = { met: '达成', 'not-met': '未达', pending: '待核' }
function text(value: string): string {
  return value.replaceAll('\\', '\\\\').replace(/([`*_[\]<>#|])/g, '\\$1')
}

/**
 * Human-facing acceptance minutes: goal conclusions, deliveries, metric
 * readings, next steps and unmet follow-ups only. Technical identity (cycleId,
 * revisions, commits, definition fingerprints, collection metadata) stays in
 * the material and Git — minutes are for the meeting report, not data proofing.
 */
export function deriveAcceptanceReport(input: {
  document: AcceptanceMaterial
  plan: PlanningMaterial
  decisions?: Record<string, DecisionFreshness>
}): { markdown: string } {
  const { document, plan, decisions } = input
  const lines = [`# ${text(document.version)} 版本验收纪要`, '', '## 目标与结论']
  for (const goal of plan.goals) {
    const result =
      document.results.find((item) => item.goalId === goal.goalId) ?? emptyGoalResult(goal.goalId)
    lines.push('', `### ${text(goal.title || goal.goalId)}`)
    const freshness = decisions?.[goal.goalId]
    lines.push(
      `- 结论：${result.decision ? outcomeLabels[result.decision.outcome] : '待核'}${freshness === 'changed' ? '（证据已变化，请重新核对）' : ''}`
    )
    if (goal.deliverable?.trim()) {
      lines.push(`- 约定交付：${text(goal.deliverable)}`)
    }
    lines.push(
      `- 实际交付：${result.deliveries.map((item) => `${text(item.title)}${item.location ? ` · ${text(item.location)}` : ''}`).join('；') || '待补充'}`
    )
    for (const target of goal.metricTargets) {
      const reading = result.readings.find((item) => item.ref.name === target.ref.name)
      lines.push(
        reading
          ? `- 指标 ${text(target.ref.name)}：实测 ${text(String(reading.value))}${text(reading.unit)}（目标 ${text(target.target)}）`
          : `- 指标 ${text(target.ref.name)}：目标 ${text(target.target)}，尚无有效读数`
      )
    }
    for (const reading of result.readings.filter(
      (item) => !goal.metricTargets.some((target) => target.ref.name === item.ref.name)
    )) {
      lines.push(
        `- 指标 ${text(reading.ref.name)}：实测 ${text(String(reading.value))}${text(reading.unit)}`
      )
    }
    if (result.note.trim()) {
      lines.push(`- 验收说明：${text(result.note)}`)
    }
    if (result.nextStep.trim()) {
      lines.push(`- 下一步：${text(result.nextStep)}`)
    }
  }
  const snapshot = document.taskSnapshot
  lines.push('', '## 关联 Issue')
  if (snapshot === undefined) {
    lines.push('尚未记录 Issue 快照；不能据此推断没有任务或已经完成。')
  } else if (snapshot.length === 0) {
    lines.push(
      plan.tasks.length
        ? `快照为空；固定计划仍引用 ${plan.tasks.length} 项任务，状态待补。`
        : '当时记录没有关联任务。'
    )
  }
  for (const item of snapshot ?? []) {
    const goals = plan.tasks
      .filter((ref) => taskReferenceKey(ref) === taskReferenceKey(item.reference))
      .map((ref) => ref.goalId)
      .filter(Boolean)
    const goalNote = goals.length
      ? `；目标 ${goals.map((goalId) => text(goalId!)).join('、')}`
      : ''
    lines.push(
      item.kind === 'ready'
        ? `- ${text(item.reference.repository)}#${item.reference.number} ${text(item.title)}：${text(item.state)}${goalNote}`
        : `- ${text(item.reference.repository)}#${item.reference.number}：读取失败（${text(item.error)}）${goalNote}`
    )
  }
  const gaps = plan.goals.flatMap((goal) => {
    const result = document.results.find((item) => item.goalId === goal.goalId)
    return result?.decision?.outcome === 'not-met' ? [{ goal, result }] : []
  })
  if (gaps.length > 0) {
    lines.push('', '## 未达与后续')
    for (const { goal, result } of gaps) {
      lines.push(
        `- ${text(goal.title || goal.goalId)}：${result.nextStep.trim() ? text(result.nextStep) : '后续安排待补充'}`
      )
    }
  }
  return { markdown: lines.join('\n') }
}
