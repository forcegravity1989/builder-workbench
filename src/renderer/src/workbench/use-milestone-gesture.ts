import { settleMilestoneWindows } from '../../../shared/workbench/milestone-window-order'
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
  milestoneLaneConflict,
  plannedDay,
  type MilestoneDragMode
} from '../../../shared/workbench/milestone-sdlc'

export const MILESTONE_DAY_WIDTH = 36
export const MILESTONE_LABEL_WIDTH = 220
export type MilestoneGesture =
  | { kind: 'version'; id: string; mode: 'move' }
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
  const [warning, setWarning] = useState('')
  const gesture = useRef<{
    operation: MilestoneGesture
    base: MilestoneDraft
    next: MilestoneDraft
    x: number
    left: number
  } | null>(null)
  function changed(base: MilestoneDraft, g: MilestoneGesture, delta: number) {
    if (g.kind === 'version') {
      return started.has(g.id) ? base : adjustMilestoneVersion(base, g.id, delta)
    }
    const delivery = base.material.features
      .find((f) => f.id === g.id)
      ?.deliveries.find((d) => d.id === g.deliveryId)
    if (!delivery?.stages.length || started.has(delivery.version.cycleId)) {
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
    setWarning('')
    gesture.current = {
      operation,
      base: draft,
      next: draft,
      x: event.clientX,
      left: viewport.current.scrollLeft
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function stepFor(operation: MilestoneGesture) {
    const delivery =
      operation.kind === 'delivery' &&
      draft.material.features
        .find((f) => f.id === operation.id)
        ?.deliveries.find((d) => d.id === operation.deliveryId)
    return operation.kind === 'version' || (delivery && delivery.stages[0]?.phase === 'Maintain')
      ? 1
      : 0.5
  }
  function checked(base: MilestoneDraft, operation: MilestoneGesture, delta: number) {
    const settled = settleMilestoneWindows(base, changed(base, operation, delta), started)
    if (settled.conflict) {
      setWarning(settled.conflict)
      return null
    }
    const next = settled.draft
    if (milestoneLaneConflict(next)) {
      setWarning('同一泳道不能重叠')
      return null
    }
    setWarning('')
    return next
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
    const step = stepFor(g.operation)
    const delta =
      Math.round((event.clientX - g.x + area.scrollLeft - g.left) / MILESTONE_DAY_WIDTH / step) *
      step
    g.next = checked(g.base, g.operation, delta) ?? g.next
    setPreview(g.next)
    return true
  }
  function finish(cancel = false) {
    const current = gesture.current
    gesture.current = null
    setPreview(null)
    if (cancel && current) {
      setWarning('')
    }
    if (current && !cancel && enabled) {
      apply(current.next)
    }
  }
  function keyboard(event: KeyboardEvent, operation: MilestoneGesture) {
    if (!enabled || !['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return
    }
    event.preventDefault()
    const delta = (event.key === 'ArrowLeft' ? -1 : 1) * stepFor(operation)
    const next = checked(draft, operation, delta)
    if (next) {
      apply(next)
    }
  }
  const hasFirstDelivery = (id: string) =>
    draft.material.features.some((f) =>
      f.deliveries.some((d) => d.version.cycleId === id && d.stages[0]?.phase === 'Plan')
    )
  return {
    preview,
    warning,
    begin,
    move,
    finish,
    keyboard,
    hasFirstDelivery,
    active: () => !!gesture.current
  }
}
export type MilestoneGestureApi = ReturnType<typeof useMilestoneGesture>
