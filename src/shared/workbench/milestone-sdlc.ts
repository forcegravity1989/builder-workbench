import { milestoneDay, milestoneDate } from './milestone-calendar'
import type { MilestoneDraft, MilestoneDelivery, MilestoneFeature } from './project-milestones'

export const plannedDay = (time: string) => Date.parse(`${time}:00Z`) / 86400000
export const plannedTime = (day: number) =>
  new Date(Math.round(day * 1440) * 60000).toISOString().slice(0, 16)
export const actualDay = (timestamp: string) => (Date.parse(timestamp) + 8 * 3600000) / 86400000
export type MilestoneDragMode = 'move' | 'start' | 'end'
const firstDay = milestoneDay('0000-01-01')
const endDay = milestoneDay('9999-12-31') + 1
const validSpan = (start: number, end: number, minimum: number) =>
  Number.isFinite(start) &&
  Number.isFinite(end) &&
  start >= firstDay &&
  end < endDay &&
  end - start >= minimum
export const latestFeatureEnd = (feature: MilestoneFeature) =>
  Math.max(
    -Infinity,
    ...feature.deliveries.flatMap((d) => (d.timeWindow ? [plannedDay(d.timeWindow.end)] : []))
  )
export const orderMilestoneDeliveries = (deliveries: MilestoneDelivery[]) =>
  deliveries.toSorted((a, b) =>
    (a.timeWindow?.start ?? '').localeCompare(b.timeWindow?.start ?? '')
  )
export function milestoneLaneConflict(draft: MilestoneDraft): string | undefined {
  return draft.material.features.find((feature) =>
    orderMilestoneDeliveries(feature.deliveries.filter((d) => d.timeWindow)).some(
      (d, i, all) => i > 0 && d.timeWindow!.start < all[i - 1].timeWindow!.end
    )
  )?.id
}
export function newMilestoneDelivery(
  phase: MilestoneDelivery['phase'],
  start: number
): MilestoneDelivery | null {
  if (!validSpan(start, start + 7, 0.5)) {
    return null
  }
  return {
    id: crypto.randomUUID(),
    phase,
    timeWindow: { start: plannedTime(start), end: plannedTime(start + 7) }
  }
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
  if (!validSpan(start, end, 0)) {
    return draft
  }
  return {
    ...draft,
    versions: draft.versions.map((v) =>
      v.cycleId === id
        ? { ...v, timeWindow: { start: milestoneDate(start), end: milestoneDate(end) } }
        : v
    )
  }
}
export function adjustMilestoneDelivery(
  draft: MilestoneDraft,
  featureId: string,
  deliveryId: string,
  mode: MilestoneDragMode,
  delta: number
): MilestoneDraft {
  const feature = draft.material.features.find((f) => f.id === featureId)
  const delivery = feature?.deliveries.find((d) => d.id === deliveryId)
  if (!feature || !delivery?.timeWindow || !Number.isInteger(delta * 2) || !delta) {
    return draft
  }
  const first = plannedDay(delivery.timeWindow.start),
    last = plannedDay(delivery.timeWindow.end)
  const start = first + (mode !== 'end' ? delta : 0),
    end = last + (mode !== 'start' ? delta : 0)
  if (!validSpan(start, end, 0.5)) {
    return draft
  }
  const changed = new Map<string, MilestoneDelivery>([
    [delivery.id, { ...delivery, timeWindow: { start: plannedTime(start), end: plannedTime(end) } }]
  ])
  if (delivery.phase === 'Build' && end > last) {
    let cursor = end
    for (const next of orderMilestoneDeliveries(feature.deliveries).filter(
      (d) =>
        d.id !== delivery.id &&
        d.phase === 'Maintain' &&
        d.timeWindow &&
        plannedDay(d.timeWindow.start) >= first
    )) {
      const a = plannedDay(next.timeWindow!.start),
        b = plannedDay(next.timeWindow!.end)
      if (b <= start) {
        continue
      }
      if (a >= cursor) {
        break
      }
      const shiftedEnd = cursor + b - a
      if (!validSpan(cursor, shiftedEnd, 0.5)) {
        return draft
      }
      changed.set(next.id, {
        ...next,
        timeWindow: { start: plannedTime(cursor), end: plannedTime(shiftedEnd) }
      })
      cursor = shiftedEnd
    }
  }
  // Preserve DOM order during pointer capture; commit sorts once after the gesture ends.
  return {
    ...draft,
    material: {
      ...draft.material,
      features: draft.material.features.map((f) =>
        f.id === featureId
          ? { ...f, deliveries: f.deliveries.map((d) => changed.get(d.id) ?? d) }
          : f
      )
    }
  }
}

export function updateMilestoneFeature(
  draft: MilestoneDraft,
  id: string,
  update: (feature: MilestoneFeature) => MilestoneFeature
): MilestoneDraft {
  return {
    ...draft,
    material: {
      ...draft.material,
      features: draft.material.features.map((feature) =>
        feature.id === id ? update(feature) : feature
      )
    }
  }
}
