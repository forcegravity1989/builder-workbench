import { milestoneVersionKey, type MilestoneVersionFacts } from './milestone-feature-facts'
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

export const MILESTONE_VERSION_HEIGHT = 52

export function milestoneVersionLanes(
  versions: ScheduledVersion[],
  rowHeight = MILESTONE_VERSION_HEIGHT
) {
  const ends: string[] = [],
    lanes = new Map<string, number>()
  for (const version of versions) {
    let lane = ends.findIndex((end) => end < version.timeWindow!.start)
    if (lane === -1) {
      lane = ends.length
    }
    ends[lane] = version.timeWindow!.end
    lanes.set(version.cycleId, lane)
  }
  return { lanes, versionHeight: Math.max(1, ends.length) * rowHeight }
}

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
  actualVersions,
  actualState,
  facts,
  showActual,
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
  actualVersions: ScheduledVersion[]
  actualState: { loading: boolean; failed: boolean }
  facts: Record<string, MilestoneVersionFacts>
  showActual: boolean
  weeks: MilestoneWeek[]
  editing: boolean
  disabled: boolean
  canvasWidth: number
  origin: number
  started: Set<string>
  rename(id: string, version: string, previousName?: string): void
  registerWeek(week: MilestoneWeek, name: string): void
  gesture: MilestoneGestureApi
  open(version: ScheduledVersion): void
  lanes: Map<string, number>
  height: number
}) {
  const today = milestoneToday(),
    rowHeight = showActual ? 68 : MILESTONE_VERSION_HEIGHT
  const position = (window: MilestoneWeek) => ({
    left: (milestoneDay(window.start) - origin) * dayWidth,
    width: (milestoneDay(window.end) - milestoneDay(window.start) + 1) * dayWidth,
    height: rowHeight
  })
  const dates = (window: MilestoneWeek) => `${window.start.slice(5)} — ${window.end.slice(5)}`
  const editable = editing && !disabled && !showActual
  return (
    <div className="wb-ml-version-row" style={{ height }}>
      <div className="wb-ml-label">
        <div>
          特性 / 负责人<small>{showActual ? '规划 / 实际日期' : '版本 · 日排期'}</small>
        </div>
      </div>
      <div className="wb-ml-track" style={{ width: canvasWidth }}>
        {!showActual &&
          weeks
            .filter((week) => !versionInMilestoneWeek(draft, week))
            .map((week) => (
              <div
                className="wb-ml-window wb-ml-unused-week"
                key={week.start}
                style={position(week)}
              >
                {editing && (
                  <WeekName
                    week={week}
                    disabled={disabled}
                    commit={(name) => registerWeek(week, name)}
                  />
                )}
                <small>{dates(week)}</small>
              </div>
            ))}
        {versions.map((v) => {
          const plan = draft.versions.find(
            (p) => p.cycleId === v.cycleId && p.version === v.version
          )
          const actual = actualVersions.find(
            (p) => p.cycleId === v.cycleId && p.version === v.version
          )
          const read = facts[milestoneVersionKey(v)]
          const actualLabel = actual?.timeWindow
            ? `实际 ${dates(actual.timeWindow)}`
            : read?.failed || (!read && actualState.failed)
              ? '未读到实际日期'
              : read?.loading || (!read && actualState.loading)
                ? '正在读取实际日期…'
                : read?.formalPlan
                  ? '实际日期未记录'
                  : '暂无正式计划'
          const currentWindow = showActual ? actual?.timeWindow : v.timeWindow
          const current =
            currentWindow && currentWindow.start <= today && today <= currentWindow.end
          return (
            <div
              key={v.cycleId}
              className={`wb-ml-window${current ? ' wb-ml-current-window' : ''}`}
              style={{ ...position(v.timeWindow!), top: (lanes.get(v.cycleId) ?? 0) * rowHeight }}
            >
              {current && (
                <span className="wb-ml-current-marker" title={`今天 ${today} 在此排期内`}>
                  当前
                </span>
              )}
              <div className="wb-ml-version-title">
                <MilestoneField
                  label="版本名称"
                  value={v.version}
                  editable={editable && !started.has(v.cycleId)}
                  onChange={(value) => rename(v.cycleId, value)}
                  onCommit={(value, previous) => rename(v.cycleId, value, previous)}
                />
                <MilestoneIconButton label={`进入 ${v.version} 版本总览`} onClick={() => open(v)}>
                  <ExternalLink size={13} />
                </MilestoneIconButton>
              </div>
              {showActual ? (
                <>
                  <small>
                    {plan?.timeWindow ? `规划 ${dates(plan.timeWindow)}` : '规划未安排'}
                  </small>
                  <small>{actualLabel}</small>
                </>
              ) : (
                <button
                  className={`wb-ml-version-dates${editable ? ' editable' : ''}`}
                  title="拖动整体平移版本，两端调整版本范围"
                  onPointerDown={
                    editable
                      ? (e) => gesture.begin(e, { kind: 'version', id: v.cycleId, mode: 'move' })
                      : undefined
                  }
                  onKeyDown={
                    editable
                      ? (e) => gesture.keyboard(e, { kind: 'version', id: v.cycleId, mode: 'move' })
                      : undefined
                  }
                >
                  {dates(v.timeWindow!)}
                </button>
              )}
              {editable &&
                (['start', 'end'] as const).map((edge) => (
                  <button
                    key={edge}
                    className={`wb-ml-resize ${edge}`}
                    aria-label={`${v.version} ${edge === 'start' ? '开始' : '结束'}日期：拖动或方向键调整一天`}
                    onPointerDown={(e) =>
                      gesture.begin(e, { kind: 'version', id: v.cycleId, mode: edge })
                    }
                    onKeyDown={(e) =>
                      gesture.keyboard(e, { kind: 'version', id: v.cycleId, mode: edge })
                    }
                  />
                ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
