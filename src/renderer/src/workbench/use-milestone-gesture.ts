import { useRef, useState, type RefObject, type PointerEvent, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import type { MilestoneDraft } from '../../../shared/workbench/project-milestones'
import {
  adjustMilestoneDelivery,
  adjustMilestoneVersion,
  milestoneLaneConflict,
  orderMilestoneDeliveries,
  type MilestoneDragMode
} from '../../../shared/workbench/milestone-sdlc'
import { settleMilestoneWindows } from '../../../shared/workbench/milestone-window-order'

export const MILESTONE_DAY_WIDTH = 36
export const MILESTONE_LABEL_WIDTH = 220
export type MilestoneGesture =
  | { kind: 'version'; id: string; mode: MilestoneDragMode }
  | { kind: 'delivery'; id: string; deliveryId: string; mode: MilestoneDragMode }

export function useMilestoneGesture(
  draft: MilestoneDraft,
  enabled: boolean,
  viewport: RefObject<HTMLDivElement | null>,
  commit: (draft: MilestoneDraft) => void,
  touch: (id: string) => void
) {
  const [preview, setPreview] = useState<MilestoneDraft | null>(null)
  const warning = useRef('')
  const gesture = useRef<{
    operation: MilestoneGesture
    base: MilestoneDraft
    next: MilestoneDraft
    x: number
    left: number
  } | null>(null)
  function apply(next: MilestoneDraft) {
    commit({
      ...next,
      material: {
        ...next.material,
        features: next.material.features.map((f) => ({
          ...f,
          deliveries: orderMilestoneDeliveries(f.deliveries)
        }))
      }
    })
  }
  function checked(
    base: MilestoneDraft,
    operation: MilestoneGesture,
    delta: number
  ): MilestoneDraft | null {
    if (!delta) {
      warning.current = ''
      return base
    }
    const candidate =
      operation.kind === 'version'
        ? adjustMilestoneVersion(base, operation.id, operation.mode, delta)
        : adjustMilestoneDelivery(base, operation.id, operation.deliveryId, operation.mode, delta)
    const conflict =
      candidate === base
        ? '请保留有效日期范围，版本至少一天、特性至少半天'
        : operation.kind === 'version'
          ? settleMilestoneWindows(base, candidate).conflict
          : milestoneLaneConflict(candidate)
            ? '同一特性的安排不能重叠'
            : undefined
    warning.current = conflict ?? ''
    return conflict ? null : candidate
  }
  function begin(event: PointerEvent, operation: MilestoneGesture) {
    const area = viewport.current
    if (!enabled || event.button !== 0 || !area) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    warning.current = ''
    if (operation.kind === 'delivery') {
      touch(operation.id)
    }
    gesture.current = {
      operation,
      base: draft,
      next: draft,
      x: event.clientX,
      left: area.scrollLeft
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
    g.next = checked(g.base, g.operation, delta) ?? (g.operation.mode === 'move' ? g.base : g.next)
    setPreview(g.next)
    return true
  }
  function finish(cancel = false) {
    const current = gesture.current
    gesture.current = null
    setPreview(null)
    if (!current) {
      return
    }
    if (cancel) {
      warning.current = ''
    } else if (warning.current) {
      toast.error(warning.current)
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
    if (operation.kind === 'delivery') {
      touch(operation.id)
    }
    const next = checked(
      draft,
      operation,
      (event.key === 'ArrowLeft' ? -1 : 1) * stepFor(operation)
    )
    if (next && next !== draft) {
      apply(next)
    }
    if (warning.current) {
      toast.error(warning.current)
    }
  }
  function shiftViewport(delta: number) {
    if (gesture.current) {
      gesture.current.left += delta
    }
  }
  return {
    preview,
    begin,
    move,
    finish,
    keyboard,
    shiftViewport,
    active: () => !!gesture.current
  }
}
export type MilestoneGestureApi = ReturnType<typeof useMilestoneGesture>
