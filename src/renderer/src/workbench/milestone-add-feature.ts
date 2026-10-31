import type { MilestoneDraft } from '../../../shared/workbench/project-milestones'
import {
  latestMilestoneMonth,
  milestoneToday,
  milestoneWeekAt,
  milestoneDay,
  materializeMilestoneWeek,
  datedMilestoneVersions
} from '../../../shared/workbench/milestone-calendar'
import {
  defaultMilestoneStages,
  fitMilestoneVersions
} from '../../../shared/workbench/milestone-sdlc'

export function createMilestoneFeature(draft: MilestoneDraft, started: Set<string>) {
  const today = milestoneToday()
  const focus = latestMilestoneMonth(draft, today)
  const firstVersion = datedMilestoneVersions(draft).find(
    (v) => v.timeWindow!.start.slice(0, 7) === focus
  )
  let date =
    focus === today.slice(0, 7) ? today : (firstVersion?.timeWindow!.start ?? `${focus}-01`)
  if (focus !== today.slice(0, 7) && milestoneWeekAt(milestoneDay(date)).end < `${focus}-01`) {
    date = new Date((milestoneDay(milestoneWeekAt(milestoneDay(date)).start) + 7) * 86400000)
      .toISOString()
      .slice(0, 10)
  }
  let week = milestoneWeekAt(milestoneDay(date))
  let used = materializeMilestoneWeek(draft, week, crypto.randomUUID())
  while (started.has(used.version.cycleId)) {
    week = milestoneWeekAt(milestoneDay(used.version.timeWindow!.end) + 7)
    used = materializeMilestoneWeek(draft, week, crypto.randomUUID())
  }
  date = used.version.timeWindow!.start
  let following = materializeMilestoneWeek(
    used.draft,
    milestoneWeekAt(milestoneDay(used.version.timeWindow!.end) + 7),
    crypto.randomUUID()
  )
  while (started.has(following.version.cycleId)) {
    following = materializeMilestoneWeek(
      used.draft,
      milestoneWeekAt(milestoneDay(following.version.timeWindow!.end) + 7),
      crypto.randomUUID()
    )
  }
  const id = crypto.randomUUID()
  const ref = { version: used.version.version, cycleId: used.version.cycleId }
  const featureMonth = used.version.timeWindow!.start.slice(0, 7)
  return {
    id,
    date,
    draft: fitMilestoneVersions(
      {
        ...following.draft,
        material: {
          ...following.draft.material,
          months: following.draft.material.months.some((m) => m.month === featureMonth)
            ? following.draft.material.months
            : [...following.draft.material.months, { month: featureMonth, outcome: '' }],
          features: [
            ...used.draft.material.features,
            {
              id,
              month: featureMonth,
              title: '',
              owner: '',
              deliveries: [
                {
                  id: crypto.randomUUID(),
                  version: ref,
                  stages: defaultMilestoneStages(used.version)
                },
                {
                  id: crypto.randomUUID(),
                  version: {
                    version: following.version.version,
                    cycleId: following.version.cycleId
                  },
                  stages: defaultMilestoneStages(following.version, true)
                }
              ]
            }
          ]
        }
      },
      new Set([used.version.cycleId, following.version.cycleId])
    )
  }
}
