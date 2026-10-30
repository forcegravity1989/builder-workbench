import { milestoneDay, milestoneDate } from './milestone-calendar'
import { workCalendarDay } from './work-calendar'
import {
  MilestonePhases,
  type MilestoneDraft,
  type MilestoneStage,
  type ScheduledVersion
} from './project-milestones'

export const plannedDay = (time: string) => Date.parse(`${time}:00Z`) / 86400000
export const plannedTime = (day: number) => `${milestoneDate(day)}T${day % 1 ? '12' : '00'}:00`
export const actualDay = (timestamp: string) => (Date.parse(timestamp) + 8 * 3600000) / 86400000

export function defaultMilestoneStages(
  version: ScheduledVersion,
  maintain = false
): MilestoneStage[] {
  if (!version.timeWindow) {
    return []
  }
  let cursor = milestoneDay(version.timeWindow.start)
  if (maintain) {
    return [
      {
        phase: 'Maintain',
        start: plannedTime(cursor),
        end: plannedTime(milestoneDay(version.timeWindow.end) + 1)
      }
    ]
  }
  return [2, 4, 1, 2, 1].map((slots, index) => {
    while (!workCalendarDay(milestoneDate(cursor)).working) {
      cursor = Math.floor(cursor) + 1
    }
    const start = cursor
    for (let slot = 0; slot < slots; slot++) {
      while (!workCalendarDay(milestoneDate(cursor)).working) {
        cursor = Math.floor(cursor) + 1
      }
      cursor += 0.5
    }
    return { phase: MilestonePhases[index], start: plannedTime(start), end: plannedTime(cursor) }
  })
}

export type MilestoneDragMode = 'move' | 'start' | 'end'

/** Version resizing never silently rescales feature plans; submission reports overflow. */
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
  if (end < start) {
    return draft
  }
  return {
    ...draft,
    versions: draft.versions.map((v) =>
      v.cycleId === id
        ? { ...v, timeWindow: { start: milestoneDate(start), end: milestoneDate(end) } }
        : v
    ),
    material: {
      ...draft.material,
      features:
        mode !== 'move'
          ? draft.material.features
          : draft.material.features.map((f) => ({
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

/** Half-day resizing moves the shared boundary, retaining at least half a day per phase. */
export function adjustMilestoneDelivery(
  draft: MilestoneDraft,
  featureId: string,
  deliveryId: string,
  mode: MilestoneDragMode,
  stageIndex: number,
  delta: number,
  target?: ScheduledVersion
): MilestoneDraft {
  const delivery = draft.material.features
    .find((f) => f.id === featureId)
    ?.deliveries.find((d) => d.id === deliveryId)
  if (!delivery || !Number.isInteger(delta * 2) || !delta) {
    return draft
  }
  const stages = delivery.stages.map((s) => ({
    ...s,
    start: plannedDay(s.start),
    end: plannedDay(s.end)
  }))
  if (mode === 'move') {
    stages.forEach((s) => {
      s.start += delta
      s.end += delta
    })
  } else {
    const stage = stages[stageIndex]
    if (!stage) {
      return draft
    }
    if (mode === 'start') {
      if (
        stage.end - (stage.start + delta) < 0.5 ||
        (stageIndex > 0 && stage.start + delta - stages[stageIndex - 1].start < 0.5)
      ) {
        return draft
      }
      stage.start += delta
      if (stageIndex) {
        stages[stageIndex - 1].end = stage.start
      }
    } else {
      if (
        stage.end + delta - stage.start < 0.5 ||
        (stageIndex < stages.length - 1 && stages[stageIndex + 1].end - (stage.end + delta) < 0.5)
      ) {
        return draft
      }
      stage.end += delta
      if (stageIndex < stages.length - 1) {
        stages[stageIndex + 1].start = stage.end
      }
    }
  }
  return {
    ...draft,
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
                      ...(target
                        ? { version: { version: target.version, cycleId: target.cycleId } }
                        : {}),
                      stages: stages.map((s) => ({
                        ...s,
                        start: plannedTime(s.start),
                        end: plannedTime(s.end)
                      }))
                    }
              )
            }
      )
    }
  }
}
