import { Flag } from 'lucide-react'
import { MilestoneField } from './milestone-field'
import type { MilestoneDraft } from '../../../shared/workbench/project-milestones'
export function MilestoneNavigation({
  visible,
  month,
  enabled,
  selectMonth,
  setLocate,
  editField,
  addMonth
}: {
  visible: MilestoneDraft
  month: string
  enabled: boolean
  selectMonth(month: string): void
  setLocate(value: string): void
  editField(update: (d: MilestoneDraft) => MilestoneDraft): void
  addMonth(month: string): void
}) {
  const months = visible.material.months.toSorted((a, b) => a.month.localeCompare(b.month))
  return (
    <div className="wb-ml-navigation">
      <div className="wb-ml-axis-heading">
        <span>里程碑时间轴</span>
        {enabled ? (
          <label>
            月份
            <input
              type="month"
              aria-label="规划月份"
              value={month}
              onChange={(event) => {
                if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) {
                  addMonth(event.target.value)
                }
              }}
            />
          </label>
        ) : (
          <select
            aria-label="查看月份"
            value={month}
            onChange={(event) => {
              selectMonth(event.target.value)
              setLocate(event.target.value)
            }}
          >
            {months.map((m) => (
              <option key={m.month} value={m.month}>
                {m.month}
              </option>
            ))}
          </select>
        )}
      </div>
      <nav className="wb-ml-nav" aria-label="里程碑时间导航">
        {months.map((m) => {
          const first = `${m.month}-01`
          const last = new Date(Date.parse(`${first}T00:00:00Z`))
          last.setUTCMonth(last.getUTCMonth() + 1)
          last.setUTCDate(0)
          const end = last.toISOString().slice(0, 10)
          const versions = visible.versions
            .filter(
              (v) =>
                v.timeWindow?.start &&
                v.timeWindow.end &&
                v.timeWindow.start <= v.timeWindow.end &&
                v.timeWindow.start <= end &&
                v.timeWindow.end >= first
            )
            .toSorted((a, b) => a.timeWindow!.end.localeCompare(b.timeWindow!.end))
          return (
            <div
              key={m.month}
              className={`wb-ml-month ${m.month === month ? 'selected' : ''}`}
              style={{ minWidth: Math.max(300, versions.length * 130) }}
            >
              <div
                className="wb-ml-ticks"
                style={{ gridTemplateColumns: `repeat(${Math.max(1, versions.length)}, 1fr)` }}
              >
                {versions.map((v, index) => (
                  <div key={v.cycleId} className="wb-ml-tick">
                    <button
                      aria-label={`定位 ${v.version}`}
                      onClick={() => {
                        selectMonth(m.month)
                        setLocate(v.cycleId)
                      }}
                    >
                      <span className="wb-ml-flag-slot">
                        {index === versions.length - 1 && (
                          <span className="wb-ml-flag">
                            <Flag size={13} />
                            {Number(m.month.slice(5))} 月
                          </span>
                        )}
                      </span>
                      <i className="wb-ml-tick-dot" />
                      <b>{v.version}</b>
                      <small>
                        {v.timeWindow!.start.slice(5)} — {v.timeWindow!.end.slice(5)}
                      </small>
                    </button>
                    {index === versions.length - 1 && (
                      <div className="wb-ml-outcome">
                        <MilestoneField
                          label="本月阶段成果"
                          value={m.outcome}
                          editable={enabled}
                          onChange={(outcome) =>
                            editField((d) => ({
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
                    )}
                  </div>
                ))}
              </div>
              {!versions.length && <small>{m.month} · 尚未登记有日期的版本</small>}
            </div>
          )
        })}
      </nav>
    </div>
  )
}
