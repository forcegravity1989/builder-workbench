import { milestoneDay, milestoneDate } from './milestone-calendar'
import { milestoneDeliveryWindow } from './milestone-delivery-window'
import {
  MilestonePhases,
  type MilestoneDraft,
  type MilestoneStage,
  type ScheduledVersion
} from './project-milestones'

export const plannedDay = (time: string) => Date.parse(`${time}:00Z`) / 86400000
export const plannedTime = (day: number) =>
  new Date(Math.round(day * 1440) * 60000).toISOString().slice(0, 16)
export const actualDay = (timestamp: string) => (Date.parse(timestamp) + 8 * 3600000) / 86400000
export type MilestoneDragMode = 'move' | 'start' | 'end'

export function defaultMilestoneStages(
  version: ScheduledVersion,
  maintain = false
): MilestoneStage[] {
  if (!version.timeWindow) {
    return []
  }
  const start = milestoneDay(version.timeWindow.start),
    end = milestoneDay(version.timeWindow.end) + 1
  const weights = maintain ? [1] : [0.2, 0.4, 0.1, 0.2, 0.1]
  let cursor = start
  return weights.map((weight, index) => {
    const next = index === weights.length - 1 ? end : cursor + (end - start) * weight
    const stage = {
      phase: maintain ? ('Maintain' as const) : MilestonePhases[index],
      start: plannedTime(cursor),
      end: plannedTime(next)
    }
    cursor = next
    return stage
  })
}

export function milestoneLaneConflict(draft: MilestoneDraft): string | undefined {
  return draft.material.features.find((feature) =>
    feature.deliveries.some((delivery, index) => {
      const previous = feature.deliveries[index - 1]
      const before = previous && milestoneDeliveryWindow(previous, draft.versions)
      const current = milestoneDeliveryWindow(delivery, draft.versions)
      return (
        previous &&
        (delivery.version.cycleId === previous.version.cycleId ||
          (before && current && current.start < before.end))
      )
    })
  )?.id
}

export function adjustMilestoneVersion(
  draft: MilestoneDraft,
  id: string,
  mode: MilestoneDragMode,
  delta: number
): MilestoneDraft {
  const version = draft.versions.find((v) => v.cycleId === id)
  if (!version?.timeWindow || !Number.isInteger(delta) || !delta) {
    return draft
  }
  const start = milestoneDay(version.timeWindow.start) + (mode !== 'end' ? delta : 0)
  const end = milestoneDay(version.timeWindow.end) + (mode !== 'start' ? delta : 0)
  if (start > end) {
    return draft
  }
  return {
    ...draft,
    versions: draft.versions.map((v) =>
      v.cycleId === id
        ? { ...v, timeWindow: { start: milestoneDate(start), end: milestoneDate(end) } }
        : v
    ),
    material:
      mode !== 'move'
        ? draft.material
        : {
            ...draft.material,
            features: draft.material.features.map((f) => ({
              ...f,
              deliveries: f.deliveries.map((d) =>
                d.version.cycleId !== id
                  ? d
                  : {
                      ...d,
                      stages: d.stages.map((s) => ({
                        ...s,
                        start: plannedTime(plannedDay(s.start) + delta),
                        end: plannedTime(plannedDay(s.end) + delta)
                      }))
                    }
              )
            }))
          }
  }
}

/** A body move preserves duration inside its destination; only an outer resize expands its own version. */
export function adjustMilestoneDelivery(
  draft: MilestoneDraft,
  featureId: string,
  deliveryId: string,
  mode: MilestoneDragMode,
  delta: number,
  target?: ScheduledVersion
): MilestoneDraft {
  const delivery = draft.material.features
    .find((f) => f.id === featureId)
    ?.deliveries.find((d) => d.id === deliveryId)
  const version = target ?? draft.versions.find((v) => v.cycleId === delivery?.version.cycleId)
  if (!delivery?.stages.length || !version?.timeWindow || !Number.isInteger(delta * 2)) {
    return draft
  }
  const first = plannedDay(delivery.stages[0].start),
    last = plannedDay(delivery.stages.at(-1)!.end),
    duration = last - first
  const windowStart = milestoneDay(version.timeWindow.start),
    windowEnd = milestoneDay(version.timeWindow.end) + 1
  if (duration <= 0 || (mode === 'move' && duration > windowEnd - windowStart)) {
    return draft
  }
  const start =
    mode === 'move'
      ? Math.max(windowStart, Math.min(first + delta, windowEnd - duration))
      : first + (mode === 'start' ? delta : 0)
  const end = mode === 'move' ? start + duration : last + (mode === 'end' ? delta : 0)
  if (end - start < 0.5) {
    return draft
  }
  const stages = delivery.stages.map((s) => ({
    ...s,
    start: plannedTime(start + ((plannedDay(s.start) - first) * (end - start)) / duration),
    end: plannedTime(start + ((plannedDay(s.end) - first) * (end - start)) / duration)
  }))
  if (stages.some((s) => s.end <= s.start)) {
    return draft
  }
  return {
    ...draft,
    versions:
      mode === 'move'
        ? draft.versions
        : draft.versions.map((v) =>
            v.cycleId !== version.cycleId
              ? v
              : {
                  ...v,
                  timeWindow: {
                    start: milestoneDate(Math.min(windowStart, Math.floor(start))),
                    end: milestoneDate(Math.max(windowEnd, Math.ceil(end)) - 1)
                  }
                }
          ),
    material: {
      ...draft.material,
      features: draft.material.features.map((f) =>
        f.id !== featureId
          ? f
          : {
              ...f,
              deliveries: f.deliveries.map((d) =>
                d.id !== deliveryId
                  ? d
                  : {
                      ...d,
                      version: { version: version.version, cycleId: version.cycleId },
                      stages
                    }
              )
            }
      )
    }
  }
}
