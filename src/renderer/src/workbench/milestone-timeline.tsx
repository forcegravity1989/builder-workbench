import { MilestoneDayAxis } from './milestone-day-axis'
import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { GripVertical, Plus, X } from 'lucide-react'
import { MilestoneField } from './milestone-field'
import { MilestoneIconButton } from './milestone-icon-button'
import { MilestoneVersionRow } from './milestone-version-row'
import { MilestoneStageBars, MilestoneLegend } from './milestone-stage-bars'
import {
  useMilestoneGesture,
  MILESTONE_DAY_WIDTH as width,
  MILESTONE_LABEL_WIDTH as labelWidth
} from './use-milestone-gesture'
import { workCalendarDay } from '../../../shared/workbench/work-calendar'
import { actualDay } from '../../../shared/workbench/milestone-sdlc'
import {
  reorderMilestoneFeature,
  type MilestoneDraft,
  type MilestoneFeature,
  type ScheduledVersion
} from '../../../shared/workbench/project-milestones'
import {
  latestMilestoneMonth,
  milestoneCalendar,
  milestoneDay,
  milestoneToday,
  milestoneDate,
  datedMilestoneVersions,
  type MilestoneWeek
} from '../../../shared/workbench/milestone-calendar'

export type MilestoneLocation = { date: string; sequence: number }
type Props = {
  draft: MilestoneDraft
  editing: boolean
  busy: boolean
  edit(update: (draft: MilestoneDraft) => MilestoneDraft): void
  editField(update: (draft: MilestoneDraft) => MilestoneDraft): void
  open(version: ScheduledVersion): void
  remove(feature: MilestoneFeature): void
  rename(id: string, version: string): void
  started: Set<string>
  onScroll(x: number, y: number): void
  scrollX: number | null
  scrollY: number
  locate: MilestoneLocation | null
  registerWeek(week: MilestoneWeek, name: string): void
  addFeature(): void
  newFeature: string | null
}
export function MilestoneTimeline(props: Props) {
  const { draft, editing, edit } = props
  const enabled = editing && !props.busy
  const { weeks, start: origin, end } = milestoneCalendar(draft)
  const canvasWidth = (end - origin + 1) * width
  const viewport = useRef<HTMLDivElement>(null)
  const draggedRow = useRef<{ id: string; y: number; moved: boolean } | null>(null)
  const pan = useRef<{ x: number; left: number } | null>(null)
  const gesture = useMilestoneGesture(draft, enabled, props.started, viewport, (next) =>
    edit(() => next)
  )
  const visible = gesture.preview ?? draft
  const versions = datedMilestoneVersions(visible)
  const features = visible.material.features
  const [showPlan, setShowPlan] = useState(false)
  const laneEnds: string[] = [],
    lanes = new Map<string, number>()
  for (const version of versions) {
    let lane = laneEnds.findIndex((end) => end < version.timeWindow!.start)
    if (lane === -1) {
      lane = laneEnds.length
    }
    laneEnds[lane] = version.timeWindow!.end
    lanes.set(version.cycleId, lane)
  }
  const versionHeight = Math.max(1, laneEnds.length) * 64
  const days = Array.from({ length: end - origin + 1 }, (_, i) => {
    const day = origin + i,
      date = milestoneDate(day)
    return { day, date, ...workCalendarDay(date) }
  })
  const [rowDrop, setRowDrop] = useState<{ id: string; side: 'before' | 'after' } | null>(null)
  const initial = useRef({ x: props.scrollX, y: props.scrollY, month: latestMilestoneMonth(draft) })
  const previousOrigin = useRef<number | null>(null)
  useLayoutEffect(() => {
    const el = viewport.current
    if (!el) {
      return
    }
    if (previousOrigin.current === null) {
      el.scrollLeft =
        initial.current.x ??
        Math.max(0, (milestoneDay(`${initial.current.month}-01`) - origin) * width)
      el.scrollTop = initial.current.y
    } else if (previousOrigin.current !== origin) {
      el.scrollLeft += (previousOrigin.current - origin) * width
    }
    previousOrigin.current = origin
  }, [origin])
  const appliedLocation = useRef<MilestoneLocation | null>(props.locate)
  useLayoutEffect(() => {
    if (props.locate && props.locate !== appliedLocation.current && viewport.current) {
      viewport.current.scrollLeft = Math.max(0, (milestoneDay(props.locate.date) - origin) * width)
      appliedLocation.current = props.locate
    }
  }, [props.locate, origin])
  useLayoutEffect(() => {
    const el = viewport.current
    const row =
      props.newFeature &&
      el?.querySelector<HTMLElement>(`[data-milestone-feature="${CSS.escape(props.newFeature)}"]`)
    if (el && row) {
      el.scrollTop = Math.max(0, row.offsetTop - el.clientHeight + row.clientHeight)
    }
  }, [props.newFeature])

  function changeField(id: string, field: 'title' | 'owner', value: string) {
    props.editField((d) => ({
      ...d,
      material: {
        ...d.material,
        features: d.material.features.map((f) => (f.id === id ? { ...f, [field]: value } : f))
      }
    }))
  }
  function rowTarget(x: number, y: number) {
    const row = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-milestone-feature]')
    const id = row?.dataset.milestoneFeature
    if (!row || !id || !viewport.current?.contains(row)) {
      return null
    }
    const bounds = row.getBoundingClientRect()
    return {
      id,
      side: y > bounds.top + bounds.height / 2 ? ('after' as const) : ('before' as const)
    }
  }
  const stopPan = () => {
    pan.current = null
  }
  const stopOrdering = () => {
    draggedRow.current = null
    setRowDrop(null)
  }
  const today = milestoneDay(milestoneToday())
  return (
    <>
      <div className="wb-ml-sdlc-toolbar">
        <MilestoneLegend />
        <label className="wb-ml-show-plan">
          <input
            type="checkbox"
            checked={showPlan}
            onChange={(e) => setShowPlan(e.target.checked)}
          />
          显示计划
        </label>
      </div>
      <div
        ref={viewport}
        className="wb-ml-scroll"
        aria-label="特性交付泳道"
        onScroll={(e) => props.onScroll(e.currentTarget.scrollLeft, e.currentTarget.scrollTop)}
        onPointerDown={(e) => {
          if (
            e.button !== 0 ||
            (e.target as HTMLElement).closest('button,input,[data-ml-stop-pan]')
          ) {
            return
          }
          pan.current = { x: e.clientX, left: e.currentTarget.scrollLeft }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (gesture.move(e)) {
            return
          }
          if (pan.current) {
            e.currentTarget.scrollLeft = pan.current.left + pan.current.x - e.clientX
          }
        }}
        onPointerUp={() => {
          gesture.finish()
          stopPan()
        }}
        onPointerCancel={() => {
          gesture.finish(true)
          stopPan()
        }}
        onLostPointerCapture={() => {
          gesture.finish(true)
          stopPan()
        }}
        onKeyDownCapture={(event) => {
          if (
            gesture.active() &&
            (event.key === 'Escape' ||
              ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())))
          ) {
            event.preventDefault()
            event.stopPropagation()
            gesture.finish(true)
          }
        }}
      >
        <div className="wb-ml-canvas" style={{ width: canvasWidth + labelWidth }}>
          <div
            className="wb-ml-days-background"
            aria-hidden="true"
            style={{ left: labelWidth, width: canvasWidth, top: versionHeight + 40 }}
          >
            {days.map((d) => (
              <i
                key={d.date}
                className={d.working ? '' : 'rest'}
                style={{ left: (d.day - origin) * width, width }}
              />
            ))}
          </div>
          <div className="wb-ml-board-header">
            <MilestoneVersionRow
              draft={visible}
              versions={versions}
              weeks={weeks}
              editing={editing}
              disabled={props.busy}
              canvasWidth={canvasWidth}
              origin={origin}
              started={props.started}
              rename={props.rename}
              registerWeek={props.registerWeek}
              gesture={gesture}
              open={props.open}
              lanes={lanes}
              height={versionHeight}
            />
            <MilestoneDayAxis days={days} today={today} canvasWidth={canvasWidth} />
          </div>
          {features.map((f, row) => {
            return (
              <div
                key={f.id}
                className={`wb-ml-row${showPlan && f.deliveries.some((d) => props.started.has(d.version.cycleId)) ? ' with-baseline' : ''}${rowDrop?.id === f.id ? ` wb-ml-drop-${rowDrop.side}` : ''}`}
                data-milestone-feature={f.id}
              >
                <div className="wb-ml-label wb-ml-feature" data-ml-stop-pan>
                  {editing && (
                    <MilestoneIconButton
                      className="wb-ml-grip"
                      disabled={!enabled}
                      label={`排序 ${f.title || '新特性'}`}
                      title="拖动排序；Alt + 上下键"
                      onPointerDown={(e) => {
                        if (e.button !== 0) {
                          return
                        }
                        e.preventDefault()
                        e.currentTarget.focus({ preventScroll: true })
                        draggedRow.current = { id: f.id, y: e.clientY, moved: false }
                        setRowDrop(null)
                        e.currentTarget.setPointerCapture(e.pointerId)
                      }}
                      onPointerMove={(e) => {
                        const drag = draggedRow.current
                        const el = viewport.current
                        if (!drag || !el || (!drag.moved && Math.abs(e.clientY - drag.y) < 5)) {
                          return
                        }
                        drag.moved = true
                        const bounds = el.getBoundingClientRect()
                        if (e.clientY > bounds.bottom - 30) {
                          el.scrollTop += 14
                        }
                        if (e.clientY < bounds.top + 86) {
                          el.scrollTop -= 14
                        }
                        const target = rowTarget(e.clientX, e.clientY)
                        setRowDrop(target?.id === drag.id ? null : target)
                      }}
                      onPointerUp={(e) => {
                        const drag = draggedRow.current
                        draggedRow.current = null
                        setRowDrop(null)
                        const target = rowTarget(e.clientX, e.clientY)
                        if (!enabled || !drag?.moved || !target) {
                          return
                        }
                        edit((d) => ({
                          ...d,
                          material: {
                            ...d.material,
                            features: reorderMilestoneFeature(
                              d.material.features,
                              drag.id,
                              target.id,
                              target.side
                            )
                          }
                        }))
                      }}
                      onPointerCancel={stopOrdering}
                      onLostPointerCapture={stopOrdering}
                      onKeyDown={(e) => {
                        const next = features[row + (e.key === 'ArrowUp' ? -1 : 1)]
                        if (
                          enabled &&
                          e.altKey &&
                          ['ArrowUp', 'ArrowDown'].includes(e.key) &&
                          next
                        ) {
                          e.preventDefault()
                          edit((d) => ({
                            ...d,
                            material: {
                              ...d.material,
                              features: reorderMilestoneFeature(
                                d.material.features,
                                f.id,
                                next.id,
                                e.key === 'ArrowUp' ? 'before' : 'after'
                              )
                            }
                          }))
                        }
                      }}
                    >
                      <GripVertical size={15} />
                    </MilestoneIconButton>
                  )}
                  <div>
                    <MilestoneField
                      label="特性名称"
                      autoFocus={f.id === props.newFeature}
                      value={f.title}
                      editable={enabled}
                      onChange={(title) => changeField(f.id, 'title', title)}
                    />
                    <small>
                      <MilestoneField
                        label="负责人"
                        value={f.owner}
                        editable={enabled}
                        onChange={(owner) => changeField(f.id, 'owner', owner)}
                      />
                    </small>
                  </div>
                </div>
                <div className="wb-ml-track" style={{ width: canvasWidth }}>
                  <MilestoneStageBars
                    feature={f}
                    origin={origin}
                    enabled={enabled}
                    started={props.started}
                    showPlan={showPlan}
                    gesture={gesture}
                  />
                </div>
                {editing && (
                  <div className="wb-ml-row-actions" data-ml-stop-pan>
                    <MilestoneIconButton
                      label={`移除 ${f.title || '新特性'}`}
                      disabled={!enabled}
                      onClick={() => props.remove(f)}
                    >
                      <X size={14} />
                    </MilestoneIconButton>
                  </div>
                )}
              </div>
            )
          })}
          {!features.length && (
            <div className="wb-ml-empty-row">
              <div className="wb-ml-label" />
              <div className="wb-ml-track" style={{ width: canvasWidth }} />
            </div>
          )}
          {editing && (
            <div className="wb-ml-add-feature">
              <Button variant="ghost" size="xs" disabled={!enabled} onClick={props.addFeature}>
                <Plus size={13} />
                添加特性
              </Button>
            </div>
          )}
          <div
            className="wb-ml-today"
            style={{
              left: labelWidth + (actualDay(new Date().toISOString()) - origin) * width,
              top: versionHeight + 40
            }}
            aria-hidden="true"
          />
        </div>
      </div>
    </>
  )
}
