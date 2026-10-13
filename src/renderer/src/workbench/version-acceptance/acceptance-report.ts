import type {
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import type { DecisionFreshness } from './acceptance-decision'
import {
  acceptanceSourceProblems,
  artifactCandidateCheck,
  emptyGoalResult,
  type EvidenceCheck
} from './acceptance-model'
import { taskReferenceKey } from './acceptance-task-evidence'

export type AcceptanceVerification = {
  plan: EvidenceCheck
  decisions: Record<string, DecisionFreshness>
  issues?: string[]
}

const outcomeLabels = { met: '达成', 'not-met': '未达', pending: '待核' }
function text(value: string): string {
  return value.replaceAll('\\', '\\\\').replace(/([`*_[\]<>#|])/g, '\\$1')
}
function checkLabel(check: EvidenceCheck): string {
  return check.kind === 'verified' ? `已核对（${check.checkedAt}）` : check.reason
}

/** A history summary describes the recorded conclusions; it does not authenticate their author. */
export function summarizeAcceptance(document: AcceptanceMaterial): string {
  const met = document.results.filter((item) => item.decision?.outcome === 'met').length
  const notMet = document.results.filter((item) => item.decision?.outcome === 'not-met').length
  const pending = document.results.length - met - notMet
  return `${document.version} · ${document.cycleId}：记录达成 ${met} 项、未达 ${notMet} 项、待核 ${pending} 项；候选 ${document.candidateRef?.commit.slice(0, 12) ?? '未固定'}`
}

export function deriveAcceptanceReport(input: {
  document: AcceptanceMaterial
  plan: PlanningMaterial
  revision: string
  verification?: AcceptanceVerification
}): { summary: string; markdown: string } {
  const { document, plan, revision, verification } = input
  const lines = [
    `# ${text(document.version)} 版本验收`,
    `周期：${text(document.cycleId)}  ·  材料修订：${text(revision)}`,
    '',
    '## 固定来源',
    `- 计划：${document.planRef.kind === 'committed' ? text(document.planRef.sourceCommit) : `草案预验收 · ${text(document.planRef.sourceHostId)} · ${text(document.planRef.sourceWorktreeId)}`}`,
    `- 计划修订：${text(document.planRef.revision)}；计划周期：${text(document.planRef.cycleId)}`,
    `- 源码候选：${document.candidateRef ? `${text(document.candidateRef.repository)} @ ${text(document.candidateRef.commit)}` : '待固定'}`,
    `- 计划来源核对：${verification ? text(checkLabel(verification.plan)) : '本报告未重新核对来源'}`,
    '',
    '## 交付材料'
  ]
  if (!document.preparedArtifacts.length) {
    lines.push('尚未记录材料；按项目约定准备交付件，不统一要求安装包。')
  }
  for (const artifact of document.preparedArtifacts) {
    lines.push(
      `- ${text(artifact.kind)}：${text(artifact.location)}；候选 ${text(artifact.candidateRef.commit)}；生成 ${text(artifact.generatedAt)}`
    )
    if (artifact.executionRoot) {
      lines.push(`  执行工作区：${text(artifact.executionRoot)}`)
    }
    if (artifact.command) {
      lines.push(`  记录入口：${text(artifact.command)}`)
    }
    if (artifact.checksum) {
      lines.push(`  校验值：${text(artifact.checksum)}`)
    }
    lines.push(
      `  材料候选：${text(checkLabel(artifactCandidateCheck(artifact, document.candidateRef)))}`
    )
  }
  lines.push('', '## 原承诺与验收结果')
  for (const goal of plan.goals) {
    const result =
      document.results.find((item) => item.goalId === goal.goalId) ?? emptyGoalResult(goal.goalId)
    lines.push('', `### ${text(goal.title || goal.goalId)}`, `目标标识：${text(goal.goalId)}`)
    if (goal.deliverable) {
      lines.push(`约定交付：${text(goal.deliverable)}`)
    }
    if (goal.acceptance) {
      lines.push(`验收说明：${text(goal.acceptance)}`)
    }
    for (const target of goal.metricTargets) {
      lines.push(
        `指标目标：${text(target.ref.name)} ${text(target.target)}（口径 ${text(target.ref.definitionHash)}）`
      )
    }
    lines.push(
      `实际交付：${result.deliveries.map((item) => `${text(item.title)}${item.location ? ` · ${text(item.location)}` : ''}`).join('；') || '待补充'}`
    )
    for (const reading of result.readings) {
      const observed =
        reading.observation.kind === 'instant'
          ? `当前值时刻 ${reading.observation.observedAt}，不能据此证明历史区间目标`
          : `区间 ${reading.observation.start} 至 ${reading.observation.end}（${reading.observation.timezone}）`
      lines.push(
        `记录的脚本实测：${text(reading.ref.name)} ${text(String(reading.value))} ${text(reading.unit)}；${text(observed)}；来源 ${text(reading.source)}；采集 ${text(reading.collectedAt)}；脚本 ${text(reading.collectorRevision)}`
      )
    }
    if (goal.metricTargets.length && !result.readings.length) {
      lines.push('脚本实测：未知，尚无有效读数。')
    }
    const freshness = verification?.decisions[goal.goalId]
    lines.push(
      `记录结论：${result.decision ? outcomeLabels[result.decision.outcome] : '待核'}${freshness === 'changed' ? '（证据已变化，需重新核对）' : ''}`
    )
    if (result.decision) {
      lines.push(
        `确认来源：${text(result.decision.source)}；时间 ${text(result.decision.recordedAt)}`
      )
      if (result.decision.reason) {
        lines.push(`判断依据：${text(result.decision.reason)}`)
      }
    }
    if (result.note) {
      lines.push(`验收说明：${text(result.note)}`)
    }
    if (result.nextStep) {
      lines.push(`后续安排：${text(result.nextStep)}`)
    }
    if (result.decision?.outcome === 'not-met' && !result.nextStep.trim()) {
      lines.push('待补充：未达项的后续安排。')
    }
  }
  lines.push('', '## 当时的 Issue 快照')
  if (document.taskSnapshot === undefined) {
    lines.push('尚未记录 Issue 快照；不能据此推断没有任务或已经完成。')
  } else if (document.taskSnapshot.length === 0) {
    lines.push(
      plan.tasks.length
        ? `快照为空；固定计划仍引用 ${plan.tasks.length} 项任务，状态待补。`
        : '当时记录没有关联任务。'
    )
  }
  for (const item of document.taskSnapshot ?? []) {
    const goals = plan.tasks
      .filter((ref) => taskReferenceKey(ref) === taskReferenceKey(item.reference))
      .map((ref) => ref.goalId)
      .filter(Boolean)
    lines.push(
      `- ${text(item.reference.provider)} · ${text(item.reference.repository)} #${item.reference.number}；目标 ${goals.map((goal) => text(goal!)).join('、') || '未关联'}；读取 ${text(item.readAt)}`
    )
    if (item.kind === 'ready') {
      lines.push(`  ${text(item.title)}；状态 ${text(item.state)}；${text(item.url)}`)
    } else {
      lines.push(`  读取失败：${text(item.error)}`)
    }
    if (item.source) {
      lines.push(`  来源：${text(JSON.stringify(item.source))}`)
    }
  }
  lines.push('', '## 待核与边界')
  const problems = [...acceptanceSourceProblems(document, plan), ...(verification?.issues ?? [])]
  lines.push(...problems.map((problem) => `- ${text(problem)}`))
  lines.push('- 保存、人的结论、PR/MR 合入与正式发布分别核对；本报告不自动确认 Issue 完成。')
  return { summary: summarizeAcceptance(document), markdown: lines.join('\n') }
}
