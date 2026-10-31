import type {
  MilestoneDraft,
  MilestoneFeature,
  MilestoneMaterial
} from '../../../shared/workbench/project-milestones'
import {
  milestoneCalendar,
  milestoneDay,
  milestoneWeekAt
} from '../../../shared/workbench/milestone-calendar'
import { actualDay } from '../../../shared/workbench/milestone-sdlc'
import { featureTimeline } from './version-overview/feature-timeline'
import { taskKey, validTime } from './version-overview/feature-model'
import {
  matchMilestoneFeature,
  milestoneVersionKey,
  type MilestoneVersionFacts
} from './milestone-feature-facts'

/** Later explicit deliveries can finish first-delivery work; planned phases never filter facts. */
export function milestoneActualLayout(
  feature: MilestoneFeature,
  material: MilestoneMaterial,
  facts: Record<string, MilestoneVersionFacts>,
  started: Set<string>
) {
  const resolved = feature.deliveries
    .filter((delivery) => started.has(delivery.version.cycleId) && delivery.stages.length)
    .map((delivery) => ({
      delivery,
      read: facts[milestoneVersionKey(delivery.version)],
      feature: matchMilestoneFeature(
        delivery,
        facts[milestoneVersionKey(delivery.version)],
        material
      )
    }))
  const identities = new Set(
    resolved.flatMap((entry) => (entry.feature ? [taskKey(entry.feature.root.reference)] : []))
  )
  const candidates = identities.size === 1 ? resolved.filter((entry) => entry.feature) : []
  const observed = (entry: (typeof resolved)[number]) => {
    const at = entry.feature?.observedAt ?? entry.read?.readAt
    return validTime(at) ? Date.parse(at) : 0
  }
  const latest = candidates.toSorted((a, b) => observed(b) - observed(a))[0]?.feature
  const stages = latest
    ? featureTimeline(latest).segments.filter(
        (stage) => stage.duration !== null && validTime(stage.start) && validTime(stage.end)
      )
    : []
  const missing = resolved.filter(
    (entry) => !entry.feature || identities.size !== 1 || !stages.length
  )
  return { stages, missing }
}

/** Expand only the view to collected timestamps; never rewrite version windows or the plan. */
export function milestoneActualCalendar(
  draft: MilestoneDraft,
  facts: Record<string, MilestoneVersionFacts>,
  started: Set<string>
) {
  const calendar = milestoneCalendar(draft)
  const times = draft.material.features.flatMap((feature) =>
    milestoneActualLayout(feature, draft.material, facts, started).stages.flatMap((stage) => [
      actualDay(stage.start!),
      actualDay(stage.end!)
    ])
  )
  const start = milestoneDay(milestoneWeekAt(Math.min(calendar.start, ...times)).start)
  const last = Math.max(calendar.end, ...times)
  const weeks = []
  for (let day = start; day <= last; day += 7) {
    weeks.push(milestoneWeekAt(day))
  }
  return { ...calendar, start, end: start + weeks.length * 7 - 1, weeks }
}
