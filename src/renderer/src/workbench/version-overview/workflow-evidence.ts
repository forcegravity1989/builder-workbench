import {
  workflowFields,
  type WorkflowMetricKey,
  type WorkflowReport
} from '../../../../shared/workbench/workflow-report'
import type { CycleTaskReference } from '../version-cycle/ports'

export type WorkflowTaskReport = {
  reference: CycleTaskReference
  issueUrl: string
  feedback: { report: WorkflowReport; url: string } | null
  reportProblem?: string
  problems: string[]
}
export type WorkflowEvidence = {
  tasks: WorkflowTaskReport[]
  readAt: string
  problems: string[]
  stale?: boolean
}
export type WorkflowMetricSummary = {
  key: WorkflowMetricKey
  label: string
  hint: string
  samples: number
  involved: number
  rounds: number
  unknown: number
}

export function workflowMetricDisplay(metric: WorkflowMetricSummary) {
  const activityUnits: Record<WorkflowMetricKey, string | null> = {
    initial: null,
    ask: '轮',
    hifi: '轮',
    validation: '批',
    correction: '批',
    rework: '轮'
  }
  const caption =
    metric.key === 'rework' ? '首次人审退回 / 有结论任务总数' : '人工介入 / 有结论任务总数'
  const unit = activityUnits[metric.key]
  const detail =
    metric.key === 'rework'
      ? '分子统计首次人审要求修改的任务。首次人审通过后再次退回，分子仍记 0，右上角累计已完成返工轮次。待审和合入不能当作零返工。'
      : metric.hint
  return {
    value: metric.samples ? `${metric.involved}/${metric.samples}` : '未知',
    activity: metric.samples && unit ? `${metric.rounds} ${unit}` : null,
    caption,
    hint: `${detail} 主读数为${caption}。分母只统计本指标有明确结论且记录覆盖完整的任务，包括明确为零的任务；缺报告、缺结论、覆盖不足或报告不唯一的任务不计入。${metric.key === 'initial' ? '开工额外输入按任务记 0 或 1，不累计消息条数。' : metric.key === 'rework' ? '右上角轮次只累计分母内任务已完成的返工。' : '右上角显示分母内任务的累计轮次或批次。'}`
  }
}

export function summarizeWorkflow(tasks: WorkflowTaskReport[]): WorkflowMetricSummary[] {
  return workflowFields.map(([key, label, hint]) => {
    let samples = 0,
      involved = 0,
      rounds = 0
    for (const task of tasks) {
      if (task.problems.length || !task.feedback) {
        continue
      }
      const { report } = task.feedback
      const covered =
        key === 'initial'
          ? report.coverage.initial
          : key === 'rework'
            ? report.coverage.review
            : report.coverage.process
      const metric = report.metrics.find((item) => item.key === key)
      if (!covered || !metric || metric.count === null || metric.occurred === null) {
        continue
      }
      samples++
      involved += Number(metric.occurred)
      rounds += metric.count
    }
    return {
      key,
      label,
      hint,
      samples,
      involved,
      rounds,
      unknown: tasks.length - samples
    }
  })
}
