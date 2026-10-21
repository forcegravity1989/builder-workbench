import type {
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import { decisionFreshness, type DecisionFreshness } from './acceptance-decision'
import { emptyGoalResult } from './acceptance-model'
import { taskReferenceKey } from './acceptance-task-evidence'
import { isClosedIssueState, issueMarkFor, issueNoteFor } from './acceptance-issue-annotations'
import { acceptanceRoundState } from '../../../../shared/workbench/acceptance-rounds'

const outcomeLabels = { met: '达成', 'not-met': '未达', pending: '待核' }
const directiveTags = {
  'resolved-this-acceptance': '本次验收已解决',
  'next-week-plan': '纳入下周计划',
  'record-remaining': '记录遗留'
}
/** Both screens derive conclusions against the same persisted evidence. */
export async function buildAcceptanceReport(document: AcceptanceMaterial, plan: PlanningMaterial) {
  const decisions = Object.fromEntries(
    await Promise.all(
      plan.goals.map(async (goal) => [
        goal.goalId,
        await decisionFreshness(document, plan, goal.goalId)
      ])
    )
  )
  return deriveAcceptanceReport({ document, plan, decisions })
}
function text(value: string): string {
  return value.replaceAll('\\', '\\\\').replace(/([`*_[\]<>#|])/g, '\\$1')
}

/**
 * Human-facing acceptance minutes: goal conclusions, progress, deliveries,
 * material links, Issue facts/annotations and meeting guidance. Technical
 * identity (cycleId, revisions, commits, definition fingerprints, collection
 * metadata) stays in the material and Git — minutes are for the meeting report,
 * not data proofing.
 */
export function deriveAcceptanceReport(input: {
  document: AcceptanceMaterial
  plan: PlanningMaterial
  decisions?: Record<string, DecisionFreshness>
}): { markdown: string } {
  const { document, plan, decisions } = input
  const week = acceptanceRoundState(document).current?.week
  const lines = [
    `# ${text(document.version)}${week ? ` · ${text(week)}` : ''} 版本验收纪要`,
    '',
    '## 目标与结论'
  ]
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
    lines.push(`- 本轮进展：${result.progress?.trim() ? text(result.progress) : '待补充'}`)
    lines.push(
      `- 材料：${result.materials?.map((item) => `${text(item.label || item.url)} · ${text(item.url)}`).join('；') || '暂无材料链接'}`
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
    for (const directive of result.meetingDirectives ?? []) {
      const origin =
        directive.source === 'transcript-summary'
          ? 'AI 总结'
          : directive.sourceRef?.startsWith('conversation:')
            ? '人工提供 · AI 整理'
            : '人工补记'
      lines.push(
        `- 会议指导：${text(directive.text || '待补充')}（${directive.status === 'confirmed' ? '已确认' : '待确认'}；${directiveTags[directive.tag]}；${origin}）${directive.sourceRef ? ` · 来源：${text(directive.sourceRef)}` : ''}`
      )
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
    const goalNote = goals.length ? `；目标 ${goals.map((goalId) => text(goalId!)).join('、')}` : ''
    const annotations = goals.flatMap((goalId) => {
      const result = document.results.find((entry) => entry.goalId === goalId)
      if (!result) {
        return []
      }
      const note = issueNoteFor(result, item.reference, plan.tasks)
      const mark = issueMarkFor(result, item.reference, plan.tasks)
      const labels = [mark?.carry ? '遗留' : null, mark?.risk ? '风险' : null].filter(Boolean)
      return [
        note ? `备注：${text(note)}` : null,
        labels.length
          ? `${item.kind === 'ready' && isClosedIssueState(item.state) ? '历史标记' : '标记'}：${labels.join('、')}`
          : null
      ].filter((value): value is string => value !== null)
    })
    const line =
      item.kind === 'ready'
        ? `- ${text(item.reference.repository)}#${item.reference.number} ${text(item.title)}：${text(item.state)}${goalNote}`
        : `- ${text(item.reference.repository)}#${item.reference.number}：读取失败（${text(item.error)}）${goalNote}`
    lines.push(`${line}${annotations.length ? ` · ${annotations.join('；')}` : ''}`)
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
