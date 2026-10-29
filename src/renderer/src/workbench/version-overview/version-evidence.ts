import type {
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import { taskKey, validTime, PARSER_REVISION, type FeatureEvent } from './feature-model'

export type OverviewVersionPlan = {
  version: string
  tasks: PlanningMaterial['tasks']
  goals: PlanningMaterial['goals']
  source: 'committed' | 'draft'
}
export type VersionEvidence = {
  version: string
  plan: Pick<PlanningMaterial, 'tasks' | 'goals'>
  acceptance: Pick<AcceptanceMaterial, 'results'>
  at?: string
  revision: string
  readAt: string
}

/** Catalog commit times describe the trunk snapshot, not the acceptance event. */
export function humanAcceptanceTime(
  acceptance: Pick<AcceptanceMaterial, 'results'>,
  goalIds: readonly string[]
): string | undefined {
  if (!goalIds.length) {
    return undefined
  }
  const decisions = goalIds.map(
    (id) => acceptance.results.find((result) => result.goalId === id)?.decision
  )
  if (
    decisions.some(
      (decision) => !decision || decision.outcome === 'pending' || !validTime(decision.recordedAt)
    )
  ) {
    return undefined
  }
  return decisions
    .map((decision) => decision!.recordedAt)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0]
}
/** Confirmed goal acceptance is the current delivery convention; unresolved goals stay unknown. */
export function versionDeliveryEvents(
  records: readonly VersionEvidence[],
  associatedTasks: ReadonlySet<string>,
  before?: string,
  historyComplete = true
): FeatureEvent[] {
  let delivered = 0
  const related = records.filter((record) =>
    record.plan.tasks.some((ref) => associatedTasks.has(taskKey(ref)))
  )
  const times = related
    .filter((record) => validTime(record.at))
    .map((record) => Date.parse(record.at!))
  const orderKnown =
    historyComplete && times.length === related.length && new Set(times).size === times.length
  return [...records]
    .filter(
      (record): record is VersionEvidence & { at: string } =>
        validTime(record.at) && (!validTime(before) || Date.parse(record.at) <= Date.parse(before))
    )
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .flatMap((record) => {
      const references = record.plan.tasks.filter((ref) => associatedTasks.has(taskKey(ref)))
      if (!references.length) {
        return []
      }
      const goals = references.map((ref) => ref.goalId)
      const notMet = goals.some((id) =>
        record.acceptance.results.some(
          (result) => result.goalId === id && result.decision?.outcome === 'not-met'
        )
      )
      const hasGoal = goals.every(
        (id) => id && record.plan.goals.some((goal) => goal.goalId === id)
      )
      const confirmed =
        hasGoal &&
        goals.every((id) =>
          record.acceptance.results.some(
            (result) => result.goalId === id && result.decision?.outcome === 'met'
          )
        )
      const included = confirmed && !notMet
      if (included) {
        delivered++
      }
      return [
        {
          id: `version:${record.version}:${record.revision}`,
          phase: 'version' as const,
          label: `${record.version} · ${!hasGoal ? '交付归属未知' : notMet ? '目标未达成' : !confirmed ? '验收结论待确认' : !orderKnown ? '已交付（顺序未确认）' : delivered === 1 ? '首次交付（Pre）' : '后续交付（Release）'}`,
          at: record.at,
          url: '',
          revision: record.revision,
          readAt: record.readAt,
          rule: PARSER_REVISION,
          version: record.version,
          delivered: included
        }
      ]
    })
}

/** No reliable kickoff/test timestamps are provided by the current native readers. */
export function workActivityTimes(): {
  designStartedAt: string | null
  developmentStartedAt: string | null
  testsStartedAt: string | null
  testsFinishedAt: string | null
} {
  return {
    designStartedAt: null,
    developmentStartedAt: null,
    testsStartedAt: null,
    testsFinishedAt: null
  }
}
