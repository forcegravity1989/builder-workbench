import type { ScheduledVersion } from '../../../shared/workbench/project-milestones'
import { milestoneDay } from '../../../shared/workbench/milestone-calendar'
import {
  MILESTONE_LABEL_WIDTH as labelWidth,
  MILESTONE_DAY_WIDTH as width
} from './use-milestone-gesture'
import type { WorkCalendarDay } from '../../../shared/workbench/work-calendar'
export type MilestoneAxisDay = WorkCalendarDay & { day: number; date: string }
export function MilestoneDayAxis({
  days,
  today,
  canvasWidth,
  year,
  yearTargets,
  navigate
}: {
  days: MilestoneAxisDay[]
  today: number
  canvasWidth: number
  year: string
  yearTargets: ReadonlyMap<string, string>
  navigate(date: string): void
}) {
  return (
    <div className="wb-ml-day-row">
      <div className="wb-ml-label">
        {yearTargets.size ? (
          <select
            aria-label="跳转到年份"
            value={year}
            onChange={(event) => {
              const date = yearTargets.get(event.currentTarget.value)
              if (date) {
                navigate(date)
              }
            }}
          >
            {[...yearTargets.keys()].sort().map((key) => (
              <option key={key} value={key}>
                {key} 年
              </option>
            ))}
          </select>
        ) : (
          '日期'
        )}
        <small>每格一天 · 半天调整</small>
      </div>
      <div className="wb-ml-day-track" style={{ width: canvasWidth }}>
        {days.map((d) => (
          <div
            key={d.date}
            className={`wb-ml-day-cell ${d.working ? '' : 'rest'} ${d.day === today ? 'today' : ''}`}
            style={{ width }}
            title={`${d.date} · ${d.badge ?? (d.working ? '工作日' : '休息日')}`}
          >
            <span>{d.date.slice(5).replace('-', '/')}</span>
            <small>
              {['日', '一', '二', '三', '四', '五', '六'][new Date(d.day * 86400000).getUTCDay()]}{' '}
              {d.badge && <b>{d.badge}</b>}
            </small>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MilestoneDayGrid({
  days,
  versions,
  origin,
  canvasWidth,
  versionHeight
}: {
  days: MilestoneAxisDay[]
  versions: ScheduledVersion[]
  origin: number
  canvasWidth: number
  versionHeight: number
}) {
  return (
    <div
      className="wb-ml-days-background"
      aria-hidden="true"
      style={{ left: labelWidth, width: canvasWidth, top: versionHeight + 40 }}
    >
      {versions.map((v, index) => (
        <b
          key={v.cycleId}
          className={`wb-ml-version-band${index % 2 ? ' alternate' : ''}`}
          style={{
            left: (milestoneDay(v.timeWindow!.start) - origin) * width,
            width: (milestoneDay(v.timeWindow!.end) - milestoneDay(v.timeWindow!.start) + 1) * width
          }}
        />
      ))}
      {days.map((d) => (
        <i
          key={d.date}
          className={d.working ? '' : 'rest'}
          style={{ left: (d.day - origin) * width, width }}
        />
      ))}
    </div>
  )
}
