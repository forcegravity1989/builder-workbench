import { useRef, type RefObject } from 'react'
import { GripVertical } from 'lucide-react'
import { MilestoneIconButton } from './milestone-icon-button'
import {
  reorderMilestoneFeature,
  type MilestoneDraft,
  type MilestoneFeature
} from '../../../shared/workbench/project-milestones'

export type MilestoneRowDrop = { id: string; side: 'before' | 'after' } | null
export function MilestoneRowGrip({
  feature: f,
  index: row,
  features,
  enabled,
  viewport,
  edit,
  onDrop: setRowDrop
}: {
  feature: MilestoneFeature
  index: number
  features: MilestoneFeature[]
  enabled: boolean
  viewport: RefObject<HTMLDivElement | null>
  edit(update: (draft: MilestoneDraft) => MilestoneDraft): void
  onDrop(value: MilestoneRowDrop): void
}) {
  const draggedRow = useRef<{ id: string; y: number; moved: boolean } | null>(null)
  function rowTarget(x: number, y: number) {
    const row = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-milestone-feature]')
    const id = row?.dataset.milestoneFeature
    if (!row || !id || !viewport.current?.contains(row)) {
      return null
    }
    const bounds = row.getBoundingClientRect()
    return {
      id,
      side: y > bounds.top + bounds.height / 2 ? ('after' as const) : ('before' as const)
    }
  }
  const stopOrdering = () => {
    draggedRow.current = null
    setRowDrop(null)
  }
  return (
    <MilestoneIconButton
      className="wb-ml-grip"
      disabled={!enabled}
      label={`排序 ${f.title || '新特性'}`}
      title="拖动排序；Alt + 上下键"
      onPointerDown={(e) => {
        if (e.button !== 0) {
          return
        }
        e.preventDefault()
        e.currentTarget.focus({ preventScroll: true })
        draggedRow.current = { id: f.id, y: e.clientY, moved: false }
        setRowDrop(null)
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const drag = draggedRow.current
        const el = viewport.current
        if (!drag || !el || (!drag.moved && Math.abs(e.clientY - drag.y) < 5)) {
          return
        }
        drag.moved = true
        const bounds = el.getBoundingClientRect()
        if (e.clientY > bounds.bottom - 30) {
          el.scrollTop += 14
        }
        if (e.clientY < bounds.top + 86) {
          el.scrollTop -= 14
        }
        const target = rowTarget(e.clientX, e.clientY)
        setRowDrop(target?.id === drag.id ? null : target)
      }}
      onPointerUp={(e) => {
        const drag = draggedRow.current
        draggedRow.current = null
        setRowDrop(null)
        const target = rowTarget(e.clientX, e.clientY)
        if (!enabled || !drag?.moved || !target) {
          return
        }
        edit((d) => ({
          ...d,
          material: {
            ...d.material,
            features: reorderMilestoneFeature(d.material.features, drag.id, target.id, target.side)
          }
        }))
      }}
      onPointerCancel={stopOrdering}
      onLostPointerCapture={stopOrdering}
      onKeyDown={(e) => {
        const next = features[row + (e.key === 'ArrowUp' ? -1 : 1)]
        if (enabled && e.altKey && ['ArrowUp', 'ArrowDown'].includes(e.key) && next) {
          e.preventDefault()
          edit((d) => ({
            ...d,
            material: {
              ...d.material,
              features: reorderMilestoneFeature(
                d.material.features,
                f.id,
                next.id,
                e.key === 'ArrowUp' ? 'before' : 'after'
              )
            }
          }))
        }
      }}
    >
      <GripVertical size={15} />
    </MilestoneIconButton>
  )
}
