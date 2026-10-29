import { Flag } from 'lucide-react'
import { MilestoneField } from './milestone-field'
import type { MilestoneDraft } from '../../../shared/workbench/project-milestones'
export function MilestoneNavigation({
  visible,
  month,
  enabled,
  selectMonth,
  setLocate,
  edit
}: {
  visible: MilestoneDraft
  month: string
  enabled: boolean
  selectMonth(month: string): void
  setLocate(value: string): void
  edit(update: (d: MilestoneDraft) => MilestoneDraft): void
}) {
  const months = visible.material.months.toSorted((a, b) => a.month.localeCompare(b.month))
  return (
    <nav className="wb-ml-nav" aria-label="里程碑时间导航">
      {months.map((m) => (
        <div key={m.month} className={`wb-ml-month ${m.month === month ? 'selected' : ''}`}>
          <button
            onClick={() => {
              selectMonth(m.month)
              setLocate(m.month)
            }}
          >
            <Flag size={14} />
            {m.month}
          </button>
          <div className="wb-ml-outcome">
            <MilestoneField
              label="本月阶段成果"
              value={m.outcome}
              editable={enabled}
              onChange={(outcome) =>
                edit((d) => ({
                  ...d,
                  material: {
                    ...d.material,
                    months: d.material.months.map((item) =>
                      item.month === m.month ? { ...item, outcome } : item
                    )
                  }
                }))
              }
            />
          </div>
          <div className="wb-ml-ticks">
            {visible.versions
              .filter((v) => v.timeWindow?.start.startsWith(m.month))
              .map((v) => (
                <button
                  key={v.cycleId}
                  onClick={() => {
                    selectMonth(m.month)
                    setLocate(v.cycleId)
                  }}
                >
                  <b>{v.version}</b>
                  <small>
                    {v.timeWindow!.start.slice(5)} — {v.timeWindow!.end.slice(5)}
                  </small>
                </button>
              ))}
          </div>
        </div>
      ))}
    </nav>
  )
}
