import { useRef, type RefObject } from 'react'
import { Diamond, ExternalLink } from 'lucide-react'
import type { MilestoneDraft, ScheduledVersion } from '../../../shared/workbench/project-milestones'
import {
  latestMilestoneMonth,
  milestoneDay,
  milestoneTargetAt,
  type MilestoneTarget
} from '../../../shared/workbench/milestone-calendar'

export function MilestoneLegend() {
  return (
    <div className="wb-ml-legend" aria-label="交付节点图例" title="连线表示同一特性的两次交付安排">
      <span>
        <Diamond size={9} />
        Pre版本
      </span>
      <span>
        <Diamond size={9} fill="currentColor" />
        Release版本
      </span>
    </div>
  )
}

export function MilestoneConnection({
  pre,
  release,
  stacked
}: {
  pre: number | null
  release: number | null
  stacked: boolean
}) {
  if (pre === null || release === null) {
    return null
  }
  return (
    <svg className="wb-ml-connection" aria-hidden="true">
      <path
        d={
          stacked
            ? `M ${pre} 44 V 49 H ${release} V 54`
            : `M ${Math.min(pre, release) + 69} 43 H ${Math.max(pre, release) - 69}`
        }
      />
    </svg>
  )
}

export function MilestoneDeliveryNode({
  kind,
  version,
  name,
  active,
  left,
  top,
  enabled,
  editing,
  draft,
  origin,
  end,
  targets,
  viewport,
  hover,
  move,
  open
}: {
  kind: 'pre' | 'release'
  version: ScheduledVersion | undefined
  name: string
  active: boolean
  left: number
  top: number
  enabled: boolean
  editing: boolean
  draft: MilestoneDraft
  origin: number
  end: number
  targets: MilestoneTarget[]
  viewport: RefObject<HTMLDivElement | null>
  hover(target: MilestoneTarget | null): void
  move(target: MilestoneTarget): void
  open(): void
}) {
  const pointer = useRef<{ start: number; moved: boolean; target: MilestoneTarget | null } | null>(
    null
  )
  const ignoreClick = useRef(false)
  return (
    <button
      className={`wb-ml-node ${kind}${active ? ' moving' : ''}`}
      style={{ left, top }}
      title={editing ? '拖到版本时间窗口；Shift + 左右键移动' : '进入对应版本'}
      onPointerDown={(e) => {
        ignoreClick.current = false
        if (!enabled || e.button !== 0) {
          return
        }
        pointer.current = { start: e.clientX, moved: false, target: null }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const drag = pointer.current,
          el = viewport.current
        if (!drag || !el || (Math.abs(e.clientX - drag.start) < 5 && !drag.moved)) {
          return
        }
        drag.moved = true
        const bounds = el.getBoundingClientRect()
        if (e.clientX > bounds.right - 45) {
          el.scrollLeft += 18
        }
        if (e.clientX < bounds.left + 230 + 35) {
          el.scrollLeft -= 18
        }
        const date = Math.max(
          origin,
          Math.min(end, origin + (e.clientX - bounds.left + el.scrollLeft - 230) / 24)
        )
        drag.target = milestoneTargetAt(draft, date)
        hover(drag.target)
      }}
      onPointerUp={() => {
        const drag = pointer.current
        pointer.current = null
        hover(null)
        if (drag?.moved) {
          ignoreClick.current = true
          if (drag.target) {
            move(drag.target)
          }
        }
      }}
      onPointerCancel={() => {
        pointer.current = null
        hover(null)
        ignoreClick.current = true
      }}
      onLostPointerCapture={() => {
        pointer.current = null
        hover(null)
      }}
      onKeyDown={(e) => {
        if (!enabled || !e.shiftKey || !['ArrowLeft', 'ArrowRight'].includes(e.key)) {
          return
        }
        e.preventDefault()
        const at = targets.findIndex(
          (t) => 'version' in t && t.version.cycleId === version?.cycleId
        )
        const next =
          targets[Math.max(0, Math.min(targets.length - 1, at + (e.key === 'ArrowLeft' ? -1 : 1)))]
        if (next) {
          move(next)
        }
      }}
      onClick={() => {
        if (ignoreClick.current) {
          ignoreClick.current = false
          return
        }
        if (version) {
          open()
        } else if (enabled) {
          move(milestoneTargetAt(draft, milestoneDay(`${latestMilestoneMonth(draft)}-01`)))
        }
      }}
    >
      <strong>
        <span>
          <Diamond size={8} />
          {kind === 'pre' ? 'Pre版本' : 'Release版本'}
        </span>
        {version && <ExternalLink size={12} />}
      </strong>
      <small>{name}</small>
    </button>
  )
}
