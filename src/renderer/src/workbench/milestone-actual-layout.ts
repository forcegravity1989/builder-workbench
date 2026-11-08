import type {
  MilestoneDraft,
  MilestoneFeature,
  MilestoneMaterial,
  ScheduledVersion
} from '../../../shared/workbench/project-milestones'
import { milestoneDay } from '../../../shared/workbench/milestone-calendar'
import { compareMaterialVersions } from '../../../shared/workbench/version-catalog'
import { taskKey } from './version-overview/feature-model'
import {
  milestoneFeatureGoal,
  milestoneVersionKey,
  resolveMilestoneFeature,
  type MilestoneVersionFacts
} from './milestone-feature-facts'

/** Formal plan windows describe version periods, not measured feature work time. */
export function milestoneActualVersions(facts: Record<string, MilestoneVersionFacts>) {
  return Object.values(facts)
    .filter((read) => read.formalPlan && read.plan)
    .flatMap((read): ScheduledVersion[] => {
      const plan = read.plan!
      const window = plan.timeWindow
      return window &&
        Number.isFinite(milestoneDay(window.start)) &&
        Number.isFinite(milestoneDay(window.end)) &&
        window.end >= window.start
        ? [{ version: plan.version, cycleId: plan.cycleId, timeWindow: window }]
        : []
    })
    .toSorted((a, b) => compareMaterialVersions(a.version, b.version))
}

const hasOutcome = (outcome: string | undefined): outcome is 'met' | 'not-met' =>
  outcome === 'met' || outcome === 'not-met'

function milestoneResultVersions(
  material: MilestoneMaterial,
  facts: Record<string, MilestoneVersionFacts>
) {
  const reads = Object.values(facts).filter((read) => read.formalPlan)
  const keys = new Set(
    material.features.flatMap((feature) => {
      const matched = resolveMilestoneFeature(feature, material, reads).feature
      return matched ? [taskKey(matched.root.reference)] : []
    })
  )
  return milestoneActualVersions(facts).filter((version) => {
    const read = facts[milestoneVersionKey(version)]!
    return [...keys].some((key) => {
      const goalId = milestoneFeatureGoal(read, key)
      return (
        goalId &&
        hasOutcome(
          read.acceptance?.results.find((result) => result.goalId === goalId)?.decision?.outcome
        )
      )
    })
  })
}

export type MilestoneActualResult = {
  version: ScheduledVersion
  outcome: 'met' | 'not-met'
  label: string
  goalId: string
  featureKey: string
  lane: number
}

/** Version lanes stay aligned across features, even when formally adopted dates overlap. */
export function milestoneActualLayout(
  feature: MilestoneFeature,
  material: MilestoneMaterial,
  facts: Record<string, MilestoneVersionFacts>
) {
  const reads = Object.values(facts)
  const matched = resolveMilestoneFeature(
    feature,
    material,
    reads.filter((read) => read.formalPlan)
  )
  const results: MilestoneActualResult[] = []
  const empty = (note: string) => ({ results, lanes: 1, note })
  if (!matched.feature) {
    return empty(
      Object.values(facts).some((read) => read.failed && !read.stale)
        ? '实际结果读取失败'
        : Object.values(facts).some((read) => read.loading)
          ? '正在读取实际结果…'
          : matched.note
    )
  }
  const featureKey = taskKey(matched.feature.root.reference)
  const versions = milestoneActualVersions(facts)
  const laneEnds: number[] = []
  const lanes = new Map<string, number>()
  for (const version of milestoneResultVersions(material, facts).toSorted((a, b) =>
    a.timeWindow!.start.localeCompare(b.timeWindow!.start)
  )) {
    const start = milestoneDay(version.timeWindow!.start)
    let lane = laneEnds.findIndex((end) => end < start)
    if (lane === -1) {
      lane = laneEnds.length
    }
    laneEnds[lane] = milestoneDay(version.timeWindow!.end)
    lanes.set(milestoneVersionKey(version), lane)
  }
  let delivered = false
  let priorUnknown = false
  let classificationUnknown = false
  let incomplete = false
  let failed = false
  let undated = false
  for (const read of reads.toSorted((a, b) =>
    compareMaterialVersions(
      a.plan?.version ?? a.version?.version ?? '',
      b.plan?.version ?? b.version?.version ?? ''
    )
  )) {
    if (!read.plan) {
      priorUnknown ||= !delivered
      incomplete = true
      failed ||= read.failed
      continue
    }
    // A fixed plan that excludes this main Issue cannot affect its delivery history.
    if (!read.plan.tasks.some((task) => taskKey(task) === featureKey)) {
      continue
    }
    const goalId = read.formalPlan ? milestoneFeatureGoal(read, featureKey) : undefined
    if (!goalId) {
      priorUnknown ||= !delivered
      incomplete = true
      failed ||= read.failed
      continue
    }
    const outcome = read.acceptance?.results.find((result) => result.goalId === goalId)?.decision
      ?.outcome
    if (!hasOutcome(outcome)) {
      priorUnknown ||= !delivered
      incomplete = true
      continue
    }
    if (!delivered && priorUnknown) {
      classificationUnknown = true
      // This met may be first or maintenance, but subsequent outcomes are certainly maintenance.
      delivered = outcome === 'met'
      continue
    }
    const label = delivered
      ? outcome === 'met'
        ? '维护完成'
        : '维护未完成'
      : outcome === 'met'
        ? '已上线'
        : '未上线'
    const version = versions.find(
      (item) => milestoneVersionKey(item) === milestoneVersionKey(read.plan!)
    )
    if (version) {
      results.push({
        version,
        outcome,
        label,
        goalId,
        featureKey,
        lane: lanes.get(milestoneVersionKey(version)) ?? 0
      })
    } else {
      undated = true
    }
    delivered ||= outcome === 'met'
  }
  return {
    results,
    lanes: Math.max(1, ...results.map((result) => result.lane + 1)),
    note: classificationUnknown
      ? '前序版本结果未确认'
      : failed
        ? '部分结果读取失败'
        : undated
          ? '部分版本未记录周期日期'
          : incomplete
            ? '部分版本暂无已归档结论'
            : results.length
              ? ''
              : '暂无已归档结果'
  }
}

/** Keep unrelated historical versions out of this roadmap's calendar and version header. */
export function milestoneVisibleActualVersions(
  draft: MilestoneDraft,
  facts: Record<string, MilestoneVersionFacts>
) {
  const keys = new Set(draft.versions.map(milestoneVersionKey))
  for (const version of milestoneResultVersions(draft.material, facts)) {
    keys.add(milestoneVersionKey(version))
  }
  return milestoneActualVersions(facts).filter((version) => keys.has(milestoneVersionKey(version)))
}
