import { useRef, useState, type RefObject, type PointerEvent, type KeyboardEvent } from 'react'
import type { MilestoneDraft, ScheduledVersion } from '../../../shared/workbench/project-milestones'
import {
  datedMilestoneVersions,
  materializeMilestoneWeek,
  milestoneDay,
  milestoneWeekAt,
  nextMilestoneVersion,
  availableMilestoneVersions,
  includeMilestoneVersion
} from '../../../shared/workbench/milestone-calendar'
import {
  adjustMilestoneDelivery,
  adjustMilestoneVersion,
  defaultMilestoneStages,
  milestoneLaneConflict,
  plannedDay,
  type MilestoneDragMode
} from '../../../shared/workbench/milestone-sdlc'
import { milestoneDeliveryWindow } from '../../../shared/workbench/milestone-delivery-window'
import { settleMilestoneWindows } from '../../../shared/workbench/milestone-window-order'

export const MILESTONE_DAY_WIDTH = 36
export const MILESTONE_LABEL_WIDTH = 220
export type MilestoneGesture =
  | { kind: 'version'; id: string; mode: MilestoneDragMode }
  | { kind: 'delivery'; id: string; deliveryId: string; mode: MilestoneDragMode }

export function useMilestoneGesture(
  draft: MilestoneDraft,
  enabled: boolean,
  origin: number,
  registered: readonly ScheduledVersion[],
  viewport: RefObject<HTMLDivElement | null>,
  apply: (draft: MilestoneDraft) => void
) {
  const [preview, setPreview] = useState<MilestoneDraft | null>(null)
  const [warning, setWarning] = useState('')
  const gesture = useRef<{
    operation: MilestoneGesture
    base: MilestoneDraft
    next: MilestoneDraft
    x: number
    left: number
    grab: number
  } | null>(null)
  const reject = (message: string) => {
    setWarning(message)
    return null
  }
  function changed(
    base: MilestoneDraft,
    g: MilestoneGesture,
    delta: number,
    grab?: number
  ): MilestoneDraft | null {
    if (!delta) {
      return base
    }
    if (g.kind === 'version') {
      const adjusted = adjustMilestoneVersion(base, g.id, g.mode, delta)
      return adjusted === base ? reject('版本至少保留一天') : adjusted
    }
    const feature = base.material.features.find((f) => f.id === g.id)
    const index = feature?.deliveries.findIndex((d) => d.id === g.deliveryId) ?? -1
    let delivery = feature?.deliveries[index]
    if (!delivery) {
      return base
    }
    let next = base
    if (!delivery.stages.length) {
      const source = base.versions.find((v) => v.cycleId === delivery!.version.cycleId)
      if (!source?.timeWindow) {
        return reject('请先为原版本安排日期')
      }
      delivery = { ...delivery, stages: defaultMilestoneStages(source, index > 0) }
      next = {
        ...base,
        material: {
          ...base.material,
          features: base.material.features.map((f) =>
            f.id !== g.id
              ? f
              : {
                  ...f,
                  deliveries: f.deliveries.map((d) => (d.id === g.deliveryId ? delivery! : d))
                }
          )
        }
      }
    }
    let target = base.versions.find((v) => v.cycleId === delivery.version.cycleId)
    if (g.mode === 'move') {
      const day = (grab ?? plannedDay(delivery.stages[0].start)) + delta
      const contains = (v: ScheduledVersion) =>
        milestoneDay(v.timeWindow!.start) <= day && day < milestoneDay(v.timeWindow!.end) + 1
      const visibleCandidates = datedMilestoneVersions(base).filter(contains)
      const candidates = visibleCandidates.length
        ? visibleCandidates
        : datedMilestoneVersions({
            ...base,
            versions: availableMilestoneVersions(base, registered)
          }).filter(contains)
      if (candidates.length > 1) {
        return reject('此处有并行版本，请移到目标版本独占的日期')
      }
      target = candidates[0]
      if (!target) {
        const used = materializeMilestoneWeek(
          next,
          milestoneWeekAt(day),
          crypto.randomUUID(),
          undefined,
          registered
        )
        next = used.draft
        target = used.version
        if (
          day < milestoneDay(target.timeWindow!.start) ||
          day >= milestoneDay(target.timeWindow!.end) + 1
        ) {
          return reject('请移到版本日期内，或先调整版本范围')
        }
      }
      next = includeMilestoneVersion(next, target).draft
      const duration =
        plannedDay(delivery.stages.at(-1)!.end) - plannedDay(delivery.stages[0].start)
      if (
        duration >
        milestoneDay(target.timeWindow!.end) + 1 - milestoneDay(target.timeWindow!.start)
      ) {
        return reject(`${target.version} 放不下整段计划，请先调整该版本或特性时长`)
      }
    }
    const adjusted = adjustMilestoneDelivery(next, g.id, g.deliveryId, g.mode, delta, target)
    if (adjusted === next) {
      return reject('整段计划至少保留半天，阶段须有有效时长')
    }
    next = adjusted
    const moved = next.material.features.find((f) => f.id === g.id)!
    const first = moved.deliveries[0],
      maintain = moved.deliveries[1]
    const maintainWindow = maintain && milestoneDeliveryWindow(maintain, next.versions)
    if (
      g.mode === 'move' &&
      index === 0 &&
      target?.cycleId !== delivery.version.cycleId &&
      maintain &&
      maintainWindow &&
      (first.version.cycleId === maintain.version.cycleId ||
        maintainWindow.start < first.stages.at(-1)!.end)
    ) {
      if (!maintain.stages.length) {
        const source = next.versions.find((v) => v.cycleId === maintain.version.cycleId)!
        next = {
          ...next,
          material: {
            ...next.material,
            features: next.material.features.map((f) =>
              f.id !== g.id
                ? f
                : {
                    ...f,
                    deliveries: f.deliveries.map((d) =>
                      d.id !== maintain.id
                        ? d
                        : { ...d, stages: defaultMilestoneStages(source, true) }
                    )
                  }
            )
          }
        }
      }
      const following = nextMilestoneVersion(next, target!.timeWindow!.end, registered)
      const duration = plannedDay(maintainWindow.end) - plannedDay(maintainWindow.start)
      if (
        duration >
        milestoneDay(following.version.timeWindow!.end) +
          1 -
          milestoneDay(following.version.timeWindow!.start)
      ) {
        return reject(`${following.version.version} 放不下维护段，请先调整该版本或维护时长`)
      }
      next = adjustMilestoneDelivery(
        following.draft,
        g.id,
        maintain.id,
        'move',
        milestoneDay(following.version.timeWindow!.start) - plannedDay(maintainWindow.start),
        following.version
      )
    }
    return next
  }
  function checked(
    base: MilestoneDraft,
    operation: MilestoneGesture,
    delta: number,
    grab?: number
  ) {
    const candidate = changed(base, operation, delta, grab)
    if (!candidate) {
      return null
    }
    const settled = settleMilestoneWindows(base, candidate)
    if (settled.conflict) {
      return reject(settled.conflict)
    }
    if (milestoneLaneConflict(settled.draft)) {
      return reject('同一特性的上线段和维护段不能重叠')
    }
    setWarning('')
    return settled.draft
  }
  function begin(event: PointerEvent, operation: MilestoneGesture) {
    const area = viewport.current
    if (!enabled || event.button !== 0 || !area) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    setWarning('')
    gesture.current = {
      operation,
      base: draft,
      next: draft,
      x: event.clientX,
      left: area.scrollLeft,
      grab:
        origin +
        (event.clientX -
          area.getBoundingClientRect().left +
          area.scrollLeft -
          MILESTONE_LABEL_WIDTH) /
          MILESTONE_DAY_WIDTH
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const stepFor = (operation: MilestoneGesture) => (operation.kind === 'version' ? 1 : 0.5)
  function move(event: PointerEvent) {
    const g = gesture.current,
      area = viewport.current
    if (!g || !area) {
      return false
    }
    const bounds = area.getBoundingClientRect()
    if (event.clientX > bounds.right - 32) {
      area.scrollLeft += 12
    } else if (event.clientX < bounds.left + MILESTONE_LABEL_WIDTH + 20) {
      area.scrollLeft -= 12
    }
    const step = stepFor(g.operation)
    const delta =
      Math.round((event.clientX - g.x + area.scrollLeft - g.left) / MILESTONE_DAY_WIDTH / step) *
      step
    g.next =
      checked(g.base, g.operation, delta, g.grab) ?? (g.operation.mode === 'move' ? g.base : g.next)
    setPreview(g.next)
    return true
  }
  function finish(cancel = false) {
    const current = gesture.current
    gesture.current = null
    setPreview(null)
    if (cancel) {
      setWarning('')
    }
    if (current && !cancel && enabled && current.next !== current.base) {
      apply(current.next)
    }
  }
  function keyboard(event: KeyboardEvent, operation: MilestoneGesture) {
    if (!enabled || !['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return
    }
    event.preventDefault()
    let delta = (event.key === 'ArrowLeft' ? -1 : 1) * stepFor(operation)
    if (operation.kind === 'delivery' && operation.mode === 'move') {
      const delivery = draft.material.features
        .find((f) => f.id === operation.id)
        ?.deliveries.find((d) => d.id === operation.deliveryId)
      const window = delivery && milestoneDeliveryWindow(delivery, draft.versions)
      const own = draft.versions.find((v) => v.cycleId === delivery?.version.cycleId)
      if (!window || !own?.timeWindow) {
        return
      }
      const ordered = datedMilestoneVersions({
        ...draft,
        versions: availableMilestoneVersions(draft, registered)
      })
      const target =
        event.key === 'ArrowRight'
          ? nextMilestoneVersion(draft, own.timeWindow.end, registered).version
          : ordered.findLast((v) => v.timeWindow!.end < own.timeWindow!.start)
      if (!target?.timeWindow) {
        reject('前方没有可用版本，请先安排版本日期')
        return
      }
      delta = milestoneDay(target.timeWindow.start) - plannedDay(window.start)
    }
    const next = checked(draft, operation, delta)
    if (next && next !== draft) {
      apply(next)
    }
  }
  return { preview, warning, begin, move, finish, keyboard, active: () => !!gesture.current }
}
export type MilestoneGestureApi = ReturnType<typeof useMilestoneGesture>
