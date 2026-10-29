import type {
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import {
  taskKey,
  validTime,
  PARSER_REVISION,
  type FeatureEvent,
  type FeatureData
} from './feature-model'

export type OverviewVersionPlan = {
  version: string
  tasks: PlanningMaterial['tasks']
  goals: PlanningMaterial['goals']
  source: 'committed' | 'draft'
  confirmation?: FeatureEvent
  archive?: FeatureEvent
}
export type VersionEvidence = {
  version: string
  plan: Pick<PlanningMaterial, 'tasks' | 'goals'>
  acceptance: Pick<AcceptanceMaterial, 'results'>
  at?: string
  revision: string
  readAt: string
  archiveUrl?: string
  archive?: FeatureEvent
}

/** Confirmed goal acceptance is the current delivery convention; unresolved goals stay unknown. */
export function versionDeliveryEvents(
  records: readonly VersionEvidence[],
  associatedTasks: ReadonlySet<string>,
  before?: string,
  historyComplete = true
): FeatureEvent[] {
  let delivered = 0
  const related = records.filter(
    (record) =>
      record.plan.tasks.some((ref) => associatedTasks.has(taskKey(ref))) &&
      (!validTime(before) || !validTime(record.at) || Date.parse(record.at) <= Date.parse(before))
  )
  const times = related
    .filter((record) => validTime(record.at))
    .map((record) => Date.parse(record.at!))
  const orderKnown =
    historyComplete && times.length === related.length && new Set(times).size === times.length
  return [...related]
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
          label: `${record.version} · ${!hasGoal ? '交付归属未知' : notMet ? '目标未达成' : !confirmed ? '验收结论待确认' : !orderKnown ? '已交付（顺序未确认）' : delivered === 1 ? '首次交付（Pre）' : delivered === 2 ? '后续交付（Release）' : '后续交付'}`,
          at: record.at,
          url: record.archiveUrl ?? '',
          revision: record.revision,
          readAt: record.readAt,
          rule: PARSER_REVISION,
          version: record.version,
          delivered: included,
          deliveryKind:
            included && orderKnown
              ? delivered === 1
                ? ('pre' as const)
                : delivered === 2
                  ? ('release' as const)
                  : undefined
              : undefined
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

export function applyVersionEvidence(
  feature: FeatureData,
  entries: OverviewVersionPlan[],
  records: VersionEvidence[],
  associated: Set<string>,
  historical: boolean,
  before: string | undefined,
  complete: boolean,
  currentVersion?: string
) {
  const relatedPlans = entries.filter((entry) =>
    entry.tasks.some((ref) => associated.has(taskKey(ref)))
  )
  const relatedRecords = records.filter((record) =>
    record.plan.tasks.some((ref) => associated.has(taskKey(ref)))
  )
  feature.archives = [
    ...relatedPlans.flatMap((entry) => (entry.archive ? [entry.archive] : [])),
    ...relatedRecords.flatMap((entry) => (entry.archive ? [entry.archive] : []))
  ].filter(
    (event) =>
      !historical ||
      event.version === currentVersion ||
      (before && validTime(event.at) && Date.parse(event.at) <= Date.parse(before))
  )
  if (historical && !before) {
    feature.events = []
    feature.planningComplete = false
    feature.problems.push('历史验收 PR 合入时间未记录，暂不展示动态时序')
    return
  }
  feature.events.push(...versionDeliveryEvents(records, associated, before, complete))
  const related = entries.filter(
    (entry) =>
      entry.source === 'committed' &&
      entry.tasks.some((ref) => associated.has(taskKey(ref))) &&
      (!before ||
        !validTime(entry.confirmation?.at) ||
        Date.parse(entry.confirmation.at) <= Date.parse(before))
  )
  feature.planningComplete =
    related.length > 0 && related.every((entry) => validTime(entry.confirmation?.at))
  feature.events.push(
    ...related.flatMap((entry) =>
      entry.confirmation &&
      validTime(entry.confirmation.at) &&
      (!before || Date.parse(entry.confirmation.at) <= Date.parse(before))
        ? [entry.confirmation]
        : []
    )
  )
  if (before && validTime(feature.closedAt) && Date.parse(feature.closedAt) > Date.parse(before)) {
    feature.closedAt = undefined
  }
}
