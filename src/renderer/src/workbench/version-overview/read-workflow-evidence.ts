import {
  readWorkflowComment,
  sameWorkflowIssue
} from '../../../../shared/workbench/workflow-report'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'
import { nativeTaskReferenceReader } from '../native-task-port'
import { cycleTaskRead } from '../task-reference-reader'
import type { VersionCatalogState } from '../use-version-catalog'
import { taskKey } from './feature-model'
import { mapLimit, readFeatureEvidence } from './read-feature-evidence'
import type { WorkflowEvidence, WorkflowTaskReport } from './workflow-evidence'
import { createOverviewProviderReader } from './overview-provider-port'
import type { WorkflowCommentsResult } from '../../../../shared/workbench/workflow-report'

/** Only explicitly planned goal members are queried; feature-root expansion is not a denominator. */
export function workflowReferences(plan: PlanningMaterial) {
  const goals = new Set(plan.goals.map((goal) => goal.goalId))
  return [
    ...new Map(
      plan.tasks
        .filter((task) => task.goalId && goals.has(task.goalId))
        .map((ref) => [taskKey(ref), ref])
    ).values()
  ]
}

export async function readWorkflowEvidence(
  catalog: VersionCatalogState,
  plan: PlanningMaterial,
  force: boolean
): Promise<WorkflowEvidence> {
  if (!catalog.scope) {
    throw new Error('项目来源未就绪')
  }
  const provider = createOverviewProviderReader()
  const references = workflowReferences(plan)
  const values = await nativeTaskReferenceReader.read(catalog.scope, references, force)
  const tasks = await mapLimit(references, async (reference): Promise<WorkflowTaskReport> => {
    const value = values[references.indexOf(reference)]
    const result: WorkflowTaskReport = {
      reference,
      title: `#${reference.number}`,
      issueUrl: '',
      reports: [],
      problems: []
    }
    if (!value) {
      result.problems.push('Issue 读取未返回')
      return result
    }
    const read = cycleTaskRead(reference, value)
    if (read.kind !== 'ready' || value.kind === 'unavailable' || value.item.type !== 'issue') {
      result.problems.push(read.kind === 'unavailable' ? read.error : '计划引用未读为 Issue')
      return result
    }
    result.title = read.task.title
    result.issueUrl = read.task.url
    const evidence = await readFeatureEvidence(
      read.task,
      [read.task],
      catalog,
      [plan.version],
      undefined,
      provider
    )
    result.problems.push(...evidence.problems)
    for (const pull of evidence.pulls) {
      let comments: WorkflowCommentsResult
      try {
        comments = await provider.comments(catalog, read.task, pull.number, force)
      } catch (reason) {
        result.problems.push(
          `PR #${pull.number} 指标评论：${reason instanceof Error ? reason.message : String(reason)}`
        )
        continue
      }
      for (const comment of comments.comments) {
        const report = readWorkflowComment(comment)
        if (report.kind !== 'ready' || !sameWorkflowIssue(report.issueUrl, result.issueUrl)) {
          continue
        }
        result.reports.push({
          report,
          url: comment.url ?? pull.url,
          revision: JSON.stringify([pull.url, comment.id, comment.body])
        })
      }
    }
    return result
  })
  return {
    tasks,
    readAt: new Date().toISOString(),
    problems: tasks.flatMap((task) =>
      task.problems.map((problem) => `#${task.reference.number}：${problem}`)
    )
  }
}
