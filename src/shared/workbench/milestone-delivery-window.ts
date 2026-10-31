import { milestoneDate, milestoneDay } from './milestone-calendar'
import { VersionTimeWindowSchema } from './version-time-window'
import type { MilestoneDelivery, ScheduledVersion } from './project-milestones'

/** Missing stage evidence locates the association in its version, without inventing SDLC dates. */
export function milestoneDeliveryWindow(
  delivery: MilestoneDelivery,
  versions: readonly ScheduledVersion[]
): { start: string; end: string } | undefined {
  const first = delivery.stages[0],
    last = delivery.stages.at(-1)
  if (first && last) {
    return { start: first.start, end: last.end }
  }
  const window = versions.find(
    (v) => v.cycleId === delivery.version.cycleId && v.version === delivery.version.version
  )?.timeWindow
  return window && VersionTimeWindowSchema.safeParse(window).success
    ? {
        start: `${window.start}T00:00`,
        end: `${milestoneDate(milestoneDay(window.end) + 1)}T00:00`
      }
    : undefined
}
