import {
  MILESTONE_DAY_WIDTH as width,
  MILESTONE_LABEL_WIDTH as labelWidth
} from './use-milestone-gesture'
import type { WorkCalendarDay } from '../../../shared/workbench/work-calendar'
export type MilestoneAxisDay = WorkCalendarDay & { day: number; date: string }
export function MilestoneDayAxis({
  days,
  today,
  canvasWidth
}: {
  days: MilestoneAxisDay[]
  today: number
  canvasWidth: number
}) {
  return (
    <div className="wb-ml-day-row">
      <div className="wb-ml-label">
        日期<small>每格一天 · 半天调整</small>
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

export function MilestoneDayBackground({
  days,
  canvasWidth,
  top,
  origin
}: {
  days: MilestoneAxisDay[]
  canvasWidth: number
  top: number
  origin: number
}) {
  return (
    <div
      className="wb-ml-days-background"
      aria-hidden="true"
      style={{ left: labelWidth, width: canvasWidth, top }}
    >
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
