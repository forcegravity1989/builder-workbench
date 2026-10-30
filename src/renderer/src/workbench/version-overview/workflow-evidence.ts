import {
  workflowFields,
  type WorkflowMetricKey,
  type WorkflowReport
} from '../../../../shared/workbench/workflow-report'
import type { CycleTaskReference } from '../version-cycle/ports'

export type WorkflowTaskReport = {
  reference: CycleTaskReference
  title: string
  issueUrl: string
  reports: { report: WorkflowReport; url: string; revision: string }[]
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
  rejections: number
  unknown: number
}

export function workflowMetricDisplay(metric: WorkflowMetricSummary) {
  const captions: Record<WorkflowMetricKey, string> = {
    initial: '需补充任务 / 开工记次 / 有结论任务',
    ask: '涉及任务 / 提问轮次 / 有结论任务',
    hifi: '涉及任务 / 评审轮次 / 有结论任务',
    validation: '涉及任务 / 指导批次 / 有结论任务',
    correction: '涉及任务 / 纠偏批次 / 有结论任务',
    rework: '首次人审退回任务 / 已返工轮次 / 有结论任务'
  }
  const caption = captions[metric.key]
  const detail =
    metric.key === 'rework'
      ? '第一数统计首次人审要求修改的任务。首次人审通过后再次退回，第一数仍记 0，第二数照计已完成返工轮次。待审和合入不能当作零返工。'
      : metric.hint
  return {
    value: metric.samples ? `${metric.involved}/${metric.rounds}/${metric.samples}` : '未知',
    caption,
    hint: `${detail} 三个数依次为：${caption}。同一 Issue 只计一次；第三个数仅含本指标有明确记录且覆盖完整的任务，包括明确为零的任务。有报告但缺结论、覆盖不足或冲突的任务不计入。${metric.key === 'initial' ? '开工额外输入按任务记 0 或 1，不累计消息条数，因此前两个数相同。' : ''}`
  }
}

/** One Issue contributes at most once per metric; disagreeing reports are not added. */
export function summarizeWorkflow(tasks: WorkflowTaskReport[]): WorkflowMetricSummary[] {
  return workflowFields.map(([key, label, hint]) => {
    let samples = 0,
      involved = 0,
      rounds = 0,
      rejections = 0
    for (const task of tasks) {
      if (task.problems.length) {
        continue
      }
      let incomplete = false
      const values = new Map<string, { count: number; occurred: boolean; rejections: number }>()
      for (const { report } of task.reports) {
        const covered =
          key === 'initial'
            ? report.coverage.initial
            : key === 'rework'
              ? report.coverage.review
              : report.coverage.process
        const metric = report.metrics.find((item) => item.key === key)
        if (!covered || metric?.count === null || metric?.occurred === null || !metric) {
          incomplete = true
          continue
        }
        const value = {
          count: metric.count,
          occurred: metric.occurred,
          rejections: metric.rejections ?? 0
        }
        values.set(JSON.stringify(value), value)
      }
      if (incomplete || values.size !== 1) {
        continue
      }
      const value = [...values.values()][0]!
      samples++
      involved += Number(value.occurred)
      rounds += value.count
      rejections += value.rejections
    }
    return {
      key,
      label,
      hint,
      samples,
      involved,
      rounds,
      rejections,
      unknown: tasks.length - samples
    }
  })
}
