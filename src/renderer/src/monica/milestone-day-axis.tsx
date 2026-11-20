import { ChevronLeft, ChevronRight, LocateFixed } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { MilestoneIconButton } from './milestone-icon-button'
import type { ScheduledVersion } from '../../../shared/monica/project-milestones'
import {
  milestoneDay,
  milestoneDate,
  withinCivilRange
} from '../../../shared/monica/milestone-calendar'
import {
  MILESTONE_LABEL_WIDTH as labelWidth,
  MILESTONE_DAY_WIDTH as width
} from './use-milestone-gesture'
import type { WorkCalendarDay } from '../../../shared/monica/work-calendar'
export type MilestoneAxisDay = WorkCalendarDay & { day: number; date: string }
export function MilestoneDayAxis({
  days,
  today,
  canvasWidth,
  year
}: {
  days: MilestoneAxisDay[]
  today: number
  canvasWidth: number
  year: string
}) {
  return (
    <div className="monica-ml-day-row">
      <div className="monica-ml-label">
        {year} 年<small>每格一天 · 半天调整</small>
      </div>
      <div className="monica-ml-day-track" style={{ width: canvasWidth }}>
        {days.map((d) => (
          <div
            key={d.date}
            className={`monica-ml-day-cell ${d.working ? '' : 'rest'} ${d.day === today ? 'today' : ''}`}
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
      className="monica-ml-days-background"
      aria-hidden="true"
      style={{ left: labelWidth, width: canvasWidth, top: versionHeight + 40 }}
    >
      {versions.map((v, index) => (
        <b
          key={v.cycleId}
          className={`monica-ml-version-band${index % 2 ? ' alternate' : ''}`}
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

export function MilestoneRangeToolbar({
  range,
  today,
  navigate,
  rangeOnly,
  onRangeOnly
}: {
  range: { start: number; end: number }
  today: number
  navigate(date: string): void
  rangeOnly: boolean
  onRangeOnly(value: boolean): void
}) {
  return (
    <div className="monica-ml-range-toolbar">
      <div className="monica-ml-actions">
        <MilestoneIconButton
          label="向前查看一周"
          onClick={() => navigate(milestoneDate(withinCivilRange(Math.floor(range.start) - 7)))}
        >
          <ChevronLeft size={15} />
        </MilestoneIconButton>
        <Input
          type="date"
          min="0000-01-01"
          max="9999-12-31"
          aria-label="定位日期"
          className="monica-ml-jump-date"
          value={milestoneDate(Math.floor(range.start))}
          onChange={(e) => {
            if (e.target.validity.valid && e.target.value) {
              navigate(e.target.value)
            }
          }}
        />
        <small>— {milestoneDate(withinCivilRange(Math.ceil(range.end) - 1))}</small>
        <MilestoneIconButton
          label="向后查看一周"
          onClick={() => navigate(milestoneDate(withinCivilRange(Math.floor(range.start) + 7)))}
        >
          <ChevronRight size={15} />
        </MilestoneIconButton>
        <MilestoneIconButton
          label="定位今天，保留前十天"
          onClick={() => navigate(milestoneDate(today - 10))}
        >
          <LocateFixed size={15} />
        </MilestoneIconButton>
      </div>
      <select
        className="monica-ml-filter"
        aria-label="特性显示范围"
        value={rangeOnly ? 'range' : 'all'}
        onChange={(e) => onRangeOnly(e.target.value === 'range')}
      >
        <option value="range">当前时间范围有安排</option>
        <option value="all">全部特性</option>
      </select>
    </div>
  )
}
