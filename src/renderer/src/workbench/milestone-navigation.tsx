import { useEffect, useRef } from 'react'
import { Flag } from 'lucide-react'
import { MilestoneField } from './milestone-field'
import type { MilestoneDraft } from '../../../shared/workbench/project-milestones'

export function MilestoneNavigation({
  visible,
  enabled,
  editing,
  month,
  navigate,
  editField
}: {
  visible: MilestoneDraft
  enabled: boolean
  editing: boolean
  month: string
  navigate(month: string): void
  editField(update: (d: MilestoneDraft) => MilestoneDraft): void
}) {
  const scroll = useRef<HTMLDivElement>(null)
  const pan = useRef<{ x: number; left: number } | null>(null)
  const candidates =
    editing && !visible.material.months.length ? [{ month, outcome: '' }] : visible.material.months
  const months = candidates
    .filter((m) => editing || m.outcome.trim())
    .toSorted((a, b) => a.month.localeCompare(b.month))
  const keys = months.map((m) => m.month).join(',')
  useEffect(() => {
    const element = scroll.current
    const point = element?.querySelector<HTMLElement>(`[data-month="${month}"]`)
    if (element && point)
      element.scrollLeft = Math.max(
        0,
        point.offsetLeft - element.clientWidth / 2 + point.clientWidth / 2
      )
  }, [keys, month])
  if (!months.length) return null
  return (
    <nav
      ref={scroll}
      className="wb-ml-roadmap-scroll"
      aria-label="月度里程碑时间轴"
      onPointerDown={(e) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest('button,input')) return
        pan.current = { x: e.clientX, left: e.currentTarget.scrollLeft }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (pan.current) e.currentTarget.scrollLeft = pan.current.left + pan.current.x - e.clientX
      }}
      onPointerUp={() => {
        pan.current = null
      }}
      onPointerCancel={() => {
        pan.current = null
      }}
      onLostPointerCapture={() => {
        pan.current = null
      }}
    >
      <div className="wb-ml-roadmap-axis" style={{ minWidth: months.length * 240 }}>
        {months.map((m) => (
          <div className="wb-ml-roadmap-month" data-month={m.month} key={m.month}>
            <button
              className="wb-ml-roadmap-flag"
              aria-label={`定位里程碑 ${m.month}`}
              onClick={() => navigate(m.month)}
            >
              <Flag size={17} />
              <span>{m.month.replace('-', ' 年 ')} 月</span>
            </button>
            <div className="wb-ml-roadmap-caption" title={m.outcome}>
              <MilestoneField
                value={m.outcome}
                label={`${m.month} 阶段成果`}
                placeholder="一句阶段成果"
                editable={enabled}
                onChange={(outcome) =>
                  editField((d) => {
                    const existing = d.material.months.some((item) => item.month === m.month)
                    if (!existing && !outcome) return d
                    return {
                      ...d,
                      material: {
                        ...d.material,
                        months: existing
                          ? d.material.months.map((item) =>
                              item.month === m.month ? { ...item, outcome } : item
                            )
                          : [...d.material.months, { month: m.month, outcome }]
                      }
                    }
                  })
                }
              />
            </div>
          </div>
        ))}
      </div>
    </nav>
  )
}
