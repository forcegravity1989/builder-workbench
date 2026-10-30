import { useRef, useState, type RefObject, type PointerEvent, type KeyboardEvent } from 'react'
import type { MilestoneDraft } from '../../../shared/workbench/project-milestones'
import {
  datedMilestoneVersions,
  materializeMilestoneWeek,
  milestoneDay,
  milestoneWeekAt
} from '../../../shared/workbench/milestone-calendar'
import {
  adjustMilestoneDelivery,
  adjustMilestoneVersion,
  plannedDay,
  type MilestoneDragMode
} from '../../../shared/workbench/milestone-sdlc'

export const MILESTONE_DAY_WIDTH = 44
export const MILESTONE_LABEL_WIDTH = 230
export type MilestoneGesture =
  | { kind: 'version'; id: string; mode: MilestoneDragMode }
  | {
      kind: 'delivery'
      id: string
      deliveryId: string
      stage: number
      mode: MilestoneDragMode
    }
export function useMilestoneGesture(
  draft: MilestoneDraft,
  enabled: boolean,
  started: Set<string>,
  viewport: RefObject<HTMLDivElement | null>,
  apply: (draft: MilestoneDraft) => void
) {
  const [preview, setPreview] = useState<MilestoneDraft | null>(null)
  const gesture = useRef<{
    operation: MilestoneGesture
    base: MilestoneDraft
    next: MilestoneDraft
    x: number
    left: number
  } | null>(null)
  function changed(base: MilestoneDraft, g: MilestoneGesture, delta: number) {
    if (g.kind === 'version') {
      return started.has(g.id) ? base : adjustMilestoneVersion(base, g.id, g.mode, delta)
    }
    const delivery = base.material.features
      .find((f) => f.id === g.id)
      ?.deliveries.find((d) => d.id === g.deliveryId)
    if (!delivery || started.has(delivery.version.cycleId)) {
      return base
    }
    let next = base
    let target
    if (g.mode === 'move' && delta) {
      const day = plannedDay(delivery.stages[0].start) + delta
      const candidates = datedMilestoneVersions(base).filter(
        (v) => milestoneDay(v.timeWindow!.start) <= day && day < milestoneDay(v.timeWindow!.end) + 1
      )
      const own = candidates.find((v) => v.cycleId === delivery.version.cycleId)
      if (!own && candidates.length > 1) {
        return base
      }
      target = own ?? candidates[0]
      if (!target) {
        const used = materializeMilestoneWeek(base, milestoneWeekAt(day), crypto.randomUUID())
        next = used.draft
        target = used.version
      }
      if (started.has(target.cycleId)) {
        return base
      }
    }
    return adjustMilestoneDelivery(next, g.id, g.deliveryId, g.mode, g.stage, delta, target)
  }
  function begin(event: PointerEvent, operation: MilestoneGesture) {
    if (!enabled || event.button !== 0 || !viewport.current) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    gesture.current = {
      operation,
      base: draft,
      next: draft,
      x: event.clientX,
      left: viewport.current.scrollLeft
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
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
    const step = g.operation.kind === 'version' ? 1 : 0.5
    const delta =
      Math.round((event.clientX - g.x + area.scrollLeft - g.left) / MILESTONE_DAY_WIDTH / step) *
      step
    g.next = changed(g.base, g.operation, delta)
    setPreview(g.next)
    return true
  }
  function finish(cancel = false) {
    const current = gesture.current
    gesture.current = null
    setPreview(null)
    if (current && !cancel && enabled) {
      apply(current.next)
    }
  }
  function keyboard(event: KeyboardEvent, operation: MilestoneGesture) {
    if (!enabled || !['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return
    }
    event.preventDefault()
    const delta = (event.key === 'ArrowLeft' ? -1 : 1) * (operation.kind === 'version' ? 1 : 0.5)
    apply(changed(draft, operation, delta))
  }
  return { preview, begin, move, finish, keyboard, active: () => !!gesture.current }
}
export type MilestoneGestureApi = ReturnType<typeof useMilestoneGesture>
