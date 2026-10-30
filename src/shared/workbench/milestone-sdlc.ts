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

/** Delivery order belongs to one feature; separate features may run in parallel. */
export function milestoneLaneConflict(draft: MilestoneDraft): string | undefined {
  return draft.material.features.find((feature) =>
    feature.deliveries.some((delivery, index) => {
      const previous = feature.deliveries[index - 1]
      return (
        previous &&
        (delivery.version.cycleId === previous.version.cycleId ||
          delivery.stages[0]?.start < previous.stages.at(-1)!.end)
      )
    })
  )?.id
}

/** A version covers its earliest Plan and latest Deploy; Maintain occupies the whole window. */
export function fitMilestoneVersions(
  draft: MilestoneDraft,
  ids: ReadonlySet<string>
): MilestoneDraft {
  const versions = draft.versions.map((v) => {
    if (!ids.has(v.cycleId)) {
      return v
    }
    const plans = draft.material.features
      .flatMap((f) => f.deliveries)
      .filter((d) => d.version.cycleId === v.cycleId && d.stages[0]?.phase === 'Plan')
    if (!plans.length) {
      return v
    }
    return {
      ...v,
      timeWindow: {
        start: milestoneDate(
          Math.floor(Math.min(...plans.map((d) => plannedDay(d.stages[0].start))))
        ),
        end: milestoneDate(
          Math.ceil(Math.max(...plans.map((d) => plannedDay(d.stages.at(-1)!.end)))) - 1
        )
      }
    }
  })
  return fillMaintenance({ ...draft, versions }, ids)
}

function fillMaintenance(draft: MilestoneDraft, ids: ReadonlySet<string>): MilestoneDraft {
  return {
    ...draft,
    material: {
      ...draft.material,
      features: draft.material.features.map((f) => ({
        ...f,
        deliveries: f.deliveries.map((d) => {
          const v = draft.versions.find((v) => v.cycleId === d.version.cycleId)
          return ids.has(d.version.cycleId) && d.stages[0]?.phase === 'Maintain' && v?.timeWindow
            ? { ...d, stages: defaultMilestoneStages(v, true) }
            : d
        })
      }))
    }
  }
}

/** The version header translates every plan together; duration is edited on the SDLC bars. */
export function adjustMilestoneVersion(
  draft: MilestoneDraft,
  id: string,
  delta: number
): MilestoneDraft {
  const v = draft.versions.find((v) => v.cycleId === id)
  if (!v?.timeWindow || !Number.isInteger(delta) || !delta) {
    return draft
  }
  return {
    ...draft,
    versions: draft.versions.map((item) =>
      item.cycleId !== id
        ? item
        : {
            ...item,
            timeWindow: {
              start: milestoneDate(milestoneDay(v.timeWindow!.start) + delta),
              end: milestoneDate(milestoneDay(v.timeWindow!.end) + delta)
            }
          }
    ),
    material: {
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

/** Resizing a phase shifts its neighbours without compressing their duration. */
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
  const versionId = target?.cycleId ?? delivery.version.cycleId
  const isMaintain = delivery.stages[0]?.phase === 'Maintain'
  if (isMaintain && mode === 'move') {
    return target && target.cycleId !== delivery.version.cycleId
      ? draft
      : adjustMilestoneVersion(draft, versionId, delta)
  }
  if (isMaintain && !Number.isInteger(delta)) {
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
    if (isMaintain) {
      // Where new features set this version's dates, maintenance follows them, never defines a second range.
      if (
        draft.material.features.some((f) =>
          f.deliveries.some((d) => d.version.cycleId === versionId && d.stages[0]?.phase === 'Plan')
        )
      ) {
        return draft
      }
    }
    const start = stage.start + (mode === 'start' ? delta : 0)
    const end = stage.end + (mode === 'end' ? delta : 0)
    if (end - start < 0.5) {
      return draft
    }
    stage.start = start
    stage.end = end
    stages.forEach((s, i) => {
      if ((mode === 'start' && i < stageIndex) || (mode === 'end' && i > stageIndex)) {
        s.start += delta
        s.end += delta
      }
    })
  }
  let next: MilestoneDraft = {
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
                        ? {
                            version: { version: target.version, cycleId: target.cycleId },
                            ...(target.cycleId !== d.version.cycleId ? { goalId: undefined } : {})
                          }
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
  if (isMaintain && mode !== 'move') {
    next = {
      ...next,
      versions: next.versions.map((v) =>
        v.cycleId !== versionId
          ? v
          : {
              ...v,
              timeWindow: {
                start: milestoneDate(Math.floor(stages[0].start)),
                end: milestoneDate(Math.ceil(stages[0].end) - 1)
              }
            }
      )
    }
  }
  return fitMilestoneVersions(next, new Set([delivery.version.cycleId, versionId]))
}
