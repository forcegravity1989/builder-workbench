import { useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { MilestoneIconButton } from './milestone-icon-button'
import { MILESTONE_DAY_WIDTH as dayWidth, type MilestoneGestureApi } from './use-milestone-gesture'
import { MilestoneField } from './milestone-field'
import {
  milestoneDay,
  milestoneToday,
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
        if (!cancelled.current && value.trim()) {
          commit(value.trim())
        }
        setValue('')
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) {
          return
        }
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        }
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
  registerWeek,
  gesture,
  open,
  lanes,
  height
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
  gesture: MilestoneGestureApi
  open(version: ScheduledVersion): void
  lanes: Map<string, number>
  height: number
}) {
  const today = milestoneToday()
  const position = (window: MilestoneWeek) => ({
    left: (milestoneDay(window.start) - origin) * dayWidth,
    width: (milestoneDay(window.end) - milestoneDay(window.start) + 1) * dayWidth
  })
  return (
    <div className="wb-ml-version-row" style={{ height }}>
      <div className="wb-ml-label">特性 / 负责人</div>
      <div className="wb-ml-track" style={{ width: canvasWidth }}>
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
            className={`wb-ml-window${v.timeWindow!.start <= today && today <= v.timeWindow!.end ? ' wb-ml-current-window' : ''}`}
            key={v.cycleId}
            style={{ ...position(v.timeWindow!), top: (lanes.get(v.cycleId) ?? 0) * 64 }}
            title={started.has(v.cycleId) ? '已开始计划，名称沿真实版本' : undefined}
          >
            {v.timeWindow!.start <= today && today <= v.timeWindow!.end && (
              <span className="wb-ml-current-marker" title={`今天 ${today} 在此排期内`}>
                当前
              </span>
            )}
            <div className="wb-ml-version-title">
              <MilestoneField
                label="版本名称"
                value={v.version}
                editable={editing && !disabled && !started.has(v.cycleId)}
                onChange={(value) => rename(v.cycleId, value)}
              />
              <MilestoneIconButton label={`进入 ${v.version} 版本总览`} onClick={() => open(v)}>
                <ExternalLink size={13} />
              </MilestoneIconButton>
            </div>
            <button
              className="wb-ml-version-dates"
              title={
                started.has(v.cycleId) ? '已开始，原排期只读' : '拖动平移版本；两侧按天调整范围'
              }
              onPointerDown={
                editing && !disabled && !started.has(v.cycleId)
                  ? (e) => gesture.begin(e, { kind: 'version', id: v.cycleId, mode: 'move' })
                  : undefined
              }
              onKeyDown={
                editing && !disabled && !started.has(v.cycleId)
                  ? (e) => gesture.keyboard(e, { kind: 'version', id: v.cycleId, mode: 'move' })
                  : undefined
              }
            >
              {v.timeWindow!.start.slice(5)} — {v.timeWindow!.end.slice(5)}
              {started.has(v.cycleId) && ' · 已开始'}
            </button>
            {editing &&
              !disabled &&
              !started.has(v.cycleId) &&
              (['start', 'end'] as const).map((edge) => (
                <button
                  key={edge}
                  className={`wb-ml-resize ${edge}`}
                  aria-label={`${v.version} ${edge === 'start' ? '开始' : '结束'}：拖动或方向键调整一天`}
                  onPointerDown={(e) =>
                    gesture.begin(e, { kind: 'version', id: v.cycleId, mode: edge })
                  }
                  onKeyDown={(e) =>
                    gesture.keyboard(e, { kind: 'version', id: v.cycleId, mode: edge })
                  }
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}
