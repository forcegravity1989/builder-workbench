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
