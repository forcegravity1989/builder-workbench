import { useRef, useState } from 'react'
import { MilestoneField } from './milestone-field'
import {
  milestoneDay,
  versionInMilestoneWeek,
  type MilestoneWeek
} from '../../../shared/workbench/milestone-calendar'
import type { MilestoneDraft, ScheduledVersion } from '../../../shared/workbench/project-milestones'

function WeekName({
  week,
  disabled,
  commit
}: {
  week: MilestoneWeek
  disabled: boolean
  commit(name: string): void
}) {
  const [value, setValue] = useState('')
  const cancelled = useRef(false)
  return (
    <input
      className="wb-ml-inline wb-ml-week-name"
      aria-label={`版本名称 ${week.start}`}
      placeholder="版本名（自动）"
      disabled={disabled}
      value={value}
      onFocus={() => {
        cancelled.current = false
      }}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (!cancelled.current && value.trim()) commit(value.trim())
        setValue('')
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          cancelled.current = true
          setValue('')
          e.currentTarget.blur()
        }
      }}
    />
  )
}

export function MilestoneVersionRow({
  draft,
  versions,
  weeks,
  editing,
  disabled,
  canvasWidth,
  origin,
  started,
  rename,
  registerWeek
}: {
  draft: MilestoneDraft
  versions: ScheduledVersion[]
  weeks: MilestoneWeek[]
  editing: boolean
  disabled: boolean
  canvasWidth: number
  origin: number
  started: Set<string>
  rename(id: string, version: string): void
  registerWeek(week: MilestoneWeek, name: string): void
}) {
  const position = (window: MilestoneWeek) => ({
    left: (milestoneDay(window.start) - origin) * 24,
    width: (milestoneDay(window.end) - milestoneDay(window.start) + 1) * 24
  })
  return (
    <div className="wb-ml-version-row">
      <div className="wb-ml-label">特性 / 负责人</div>
      <div className="wb-ml-track wb-ml-week-grid" style={{ width: canvasWidth }}>
        {weeks
          .filter((week) => !versionInMilestoneWeek(draft, week))
          .map((week) => (
            <div className="wb-ml-window wb-ml-unused-week" key={week.start} style={position(week)}>
              {editing && (
                <WeekName
                  week={week}
                  disabled={disabled}
                  commit={(name) => registerWeek(week, name)}
                />
              )}
              <small>
                {week.start.slice(5)} — {week.end.slice(5)}
              </small>
            </div>
          ))}
        {versions.map((v) => (
          <div
            className="wb-ml-window"
            key={v.cycleId}
            style={position(v.timeWindow!)}
            title={started.has(v.cycleId) ? '已开始计划，名称沿真实版本' : undefined}
          >
            <MilestoneField
              label="版本名称"
              value={v.version}
              editable={editing && !disabled && !started.has(v.cycleId)}
              onChange={(value) => rename(v.cycleId, value)}
            />
            <small>
              {v.timeWindow!.start.slice(5)} — {v.timeWindow!.end.slice(5)}
            </small>
          </div>
        ))}
      </div>
    </div>
  )
}
