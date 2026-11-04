import { MilestoneRowGrip, type MilestoneRowDrop } from './milestone-row-grip'
import { MilestoneDayAxis } from './milestone-day-axis'
import { useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { MilestoneField } from './milestone-field'
import { MilestoneActualBars } from './milestone-actual-bars'
import { MilestoneIconButton } from './milestone-icon-button'
import { MilestoneVersionRow, milestoneVersionLanes } from './milestone-version-row'
import { MilestoneStageBars, MilestoneSdlcToolbar } from './milestone-stage-bars'
import {
  milestoneActualCalendar,
  milestoneActualLayout,
  milestoneVisibleActualVersions
} from './milestone-actual-layout'
import { useMilestoneFactReaders } from './milestone-fact-readers'
import type { VersionCatalogState } from './use-version-catalog'
import {
  useMilestoneGesture,
  MILESTONE_DAY_WIDTH as width,
  MILESTONE_LABEL_WIDTH as labelWidth
} from './use-milestone-gesture'
import { workCalendarDay } from '../../../shared/workbench/work-calendar'
import { actualDay } from '../../../shared/workbench/milestone-sdlc'
import type {
  MilestoneDraft,
  MilestoneFeature,
  ScheduledVersion
} from '../../../shared/workbench/project-milestones'
import {
  latestMilestoneMonth,
  milestoneDay,
  milestoneToday,
  milestoneDate,
  datedMilestoneVersions,
  type MilestoneWeek
} from '../../../shared/workbench/milestone-calendar'

export type MilestoneLocation = { date: string; sequence: number }
type Props = {
  catalog: VersionCatalogState
  draft: MilestoneDraft
  editing: boolean
  busy: boolean
  edit(update: (draft: MilestoneDraft) => MilestoneDraft): void
  editField(update: (draft: MilestoneDraft) => MilestoneDraft): void
  open(version: ScheduledVersion): void
  remove(feature: MilestoneFeature): void
  rename(id: string, version: string, previousName?: string): void
  started: Set<string>
  registeredVersions: readonly ScheduledVersion[]
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
  const [showActual, setShowActual] = useState(false)
  const enabled = editing && !props.busy && !showActual
  const facts = useMilestoneFactReaders(props.catalog)
  const actualVersions = showActual ? milestoneVisibleActualVersions(draft, facts.values) : []
  const { weeks, start: origin, end } = milestoneActualCalendar(draft, facts.values, actualVersions)
  const canvasWidth = (end - origin + 1) * width
  const viewport = useRef<HTMLDivElement>(null)
  const pan = useRef<{ x: number; left: number } | null>(null)
  const gesture = useMilestoneGesture(
    draft,
    enabled,
    origin,
    props.registeredVersions,
    viewport,
    (next) => edit(() => next)
  )
  const visible = gesture.preview ?? draft
  const plannedVersions = datedMilestoneVersions(visible)
  const versions = showActual
    ? [
        ...plannedVersions,
        ...actualVersions.filter((v) => !plannedVersions.some((p) => p.cycleId === v.cycleId))
      ].toSorted((a, b) => a.timeWindow!.start.localeCompare(b.timeWindow!.start))
    : plannedVersions
  const features = visible.material.features
  const { lanes, versionHeight } = milestoneVersionLanes(versions, showActual ? 68 : 52)
  const days = Array.from({ length: end - origin + 1 }, (_, i) => {
    const day = origin + i,
      date = milestoneDate(day)
    return { day, date, ...workCalendarDay(date) }
  })
  const [rowDrop, setRowDrop] = useState<MilestoneRowDrop>(null)
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
      el.scrollTop = 0
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
  const stopPan = () => {
    pan.current = null
  }
  const today = milestoneDay(milestoneToday())
  return (
    <>
      {showActual && facts.readers}
      <MilestoneSdlcToolbar
        actual={facts}
        showActual={showActual}
        onChange={setShowActual}
        addFeature={enabled ? props.addFeature : undefined}
        warning={gesture.warning}
        featureCount={features.length}
        ownerCount={new Set(features.map((feature) => feature.owner.trim()).filter(Boolean)).size}
      />
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
            {!showActual &&
              versions.map((v, index) => (
                <b
                  key={v.cycleId}
                  className={`wb-ml-version-band${index % 2 ? ' alternate' : ''}`}
                  style={{
                    left: (milestoneDay(v.timeWindow!.start) - origin) * width,
                    width:
                      (milestoneDay(v.timeWindow!.end) - milestoneDay(v.timeWindow!.start) + 1) *
                      width
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
          <div className="wb-ml-board-header">
            <MilestoneVersionRow
              draft={visible}
              versions={versions}
              actualVersions={actualVersions}
              facts={facts.values}
              actualState={facts}
              showActual={showActual}
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
            const actual = showActual
              ? milestoneActualLayout(f, visible.material, facts.values)
              : null
            return (
              <div
                key={f.id}
                className={`wb-ml-row${rowDrop?.id === f.id ? ` wb-ml-drop-${rowDrop.side}` : ''}`}
                style={actual ? { minHeight: 88 + (actual.lanes - 1) * 36 } : undefined}
                data-milestone-feature={f.id}
              >
                <div className="wb-ml-label wb-ml-feature" data-ml-stop-pan>
                  {editing && !showActual && (
                    <MilestoneRowGrip
                      feature={f}
                      index={row}
                      features={features}
                      enabled={enabled}
                      viewport={viewport}
                      edit={edit}
                      onDrop={setRowDrop}
                    />
                  )}
                  <div>
                    <MilestoneField
                      label="特性名称"
                      autoFocus={f.id === props.newFeature}
                      value={f.title}
                      editable={enabled}
                      onChange={(title) => changeField(f.id, 'title', title)}
                    />
                    <div className="wb-ml-feature-meta">
                      <MilestoneField
                        label="负责人"
                        value={f.owner}
                        editable={enabled}
                        onChange={(owner) => changeField(f.id, 'owner', owner)}
                      />
                    </div>
                    {showActual && (
                      <small className="wb-ml-plan-reference">
                        规划：
                        {f.deliveries
                          .map((d, i) => `${d.version.version} ${i === 0 ? '上线' : '维护'}`)
                          .join(' → ')}
                      </small>
                    )}
                    {actual?.note && <small className="wb-ml-result-note">{actual.note}</small>}
                  </div>
                </div>
                <div className="wb-ml-track" style={{ width: canvasWidth }}>
                  {showActual ? (
                    <MilestoneActualBars
                      feature={f}
                      material={visible.material}
                      facts={facts.values}
                      origin={origin}
                      onOpen={props.open}
                    />
                  ) : (
                    <MilestoneStageBars
                      feature={f}
                      versions={visible.versions}
                      origin={origin}
                      enabled={enabled}
                      gesture={gesture}
                    />
                  )}
                </div>
                {editing && !showActual && (
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
