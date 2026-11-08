import { MilestoneNavigation, milestoneNodeActions } from './milestone-navigation'
import { MilestoneDayAxis, MilestoneDayGrid, MilestoneRangeToolbar } from './milestone-day-axis'
import { useRef, useState } from 'react'
import { useMilestoneViewport, type MilestoneLocation } from './use-milestone-viewport'
export type { MilestoneLocation } from './use-milestone-viewport'
import { X, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { MilestoneField } from './milestone-field'
import { MilestoneActualBars } from './milestone-actual-bars'
import { MilestoneIconButton } from './milestone-icon-button'
import { MilestoneVersionRow, milestoneVersionLanes } from './milestone-version-row'
import { MilestoneStageBars, MilestoneSdlcToolbar } from './milestone-stage-bars'
import { milestoneActualLayout, milestoneVisibleActualVersions } from './milestone-actual-layout'
import { useMilestoneFactReaders } from './milestone-fact-readers'
import type { VersionCatalogState } from './use-version-catalog'
import {
  useMilestoneGesture,
  MILESTONE_DAY_WIDTH as width,
  MILESTONE_LABEL_WIDTH as labelWidth
} from './use-milestone-gesture'
import {
  actualDay,
  plannedDay,
  latestFeatureEnd,
  newMilestoneDelivery,
  orderMilestoneDeliveries,
  milestoneLaneConflict,
  updateMilestoneFeature
} from '../../../shared/workbench/milestone-sdlc'
import type {
  MilestoneDraft,
  MilestoneFeature,
  MilestoneDelivery,
  ScheduledVersion
} from '../../../shared/workbench/project-milestones'
import {
  milestoneDay,
  milestoneToday,
  milestoneDate,
  datedMilestoneVersions,
  type MilestoneWeek
} from '../../../shared/workbench/milestone-calendar'

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
  onScroll(x: number, y: number, date: string): void
  viewDate?: string
  rangeOnly: boolean
  featureOrder: string[]
  pinnedFeatures: string[]
  pinFeature(id: string): void
  onRangeOnly(value: boolean): void
  validationAttempt: boolean
  scrollX: number | null
  scrollY: number
  locate: MilestoneLocation | null
  registerWeek(week: MilestoneWeek, name: string): void
  navigate(date: string): void
  addFeature(date: string, end: number): void
  newFeature: string | null
}
export function MilestoneTimeline(props: Props) {
  const { draft, editing, edit } = props
  const [showActual, setShowActual] = useState(false)
  const enabled = editing && !props.busy && !showActual
  const today = milestoneDay(milestoneToday())
  const viewport = useRef<HTMLDivElement>(null)
  const touch = (id: string) => {
    if (!props.pinnedFeatures.includes(id)) {
      props.pinFeature(id)
    }
  }
  const gesture = useMilestoneGesture(draft, enabled, viewport, (next) => edit(() => next), touch)
  const { origin, end, weeks, canvasWidth, range, days, scrollProps } = useMilestoneViewport(
    props,
    viewport,
    gesture
  )
  const visible = gesture.preview ?? draft
  const facts = useMilestoneFactReaders(props.catalog)
  const actualVersions = showActual ? milestoneVisibleActualVersions(draft, facts.values) : []
  const plannedVersions = datedMilestoneVersions(visible)
  const versions = (
    showActual
      ? [
          ...plannedVersions,
          ...actualVersions.filter((v) => !plannedVersions.some((p) => p.cycleId === v.cycleId))
        ]
      : plannedVersions
  )
    .filter(
      (v) => milestoneDay(v.timeWindow!.start) <= end && milestoneDay(v.timeWindow!.end) >= origin
    )
    .toSorted((a, b) => a.timeWindow!.start.localeCompare(b.timeWindow!.start))
  const layouts = new Map(
    visible.material.features.map((f) => [
      f.id,
      showActual ? milestoneActualLayout(f, visible.material, facts.values) : null
    ])
  )
  const chronological = visible.material.features.toSorted(
    (a, b) => latestFeatureEnd(b) - latestFeatureEnd(a)
  )
  const order = [
    ...visible.material.features.filter((f) => !props.featureOrder.includes(f.id)).map((f) => f.id),
    ...props.featureOrder
  ]
  const ordered =
    editing && !showActual
      ? visible.material.features.toSorted((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
      : chronological
  const features = ordered.filter((f) => {
    if (
      !props.rangeOnly ||
      !f.title.trim() ||
      (editing &&
        !showActual &&
        (f.id === props.newFeature || props.pinnedFeatures.includes(f.id)))
    ) {
      return true
    }
    const actual = layouts.get(f.id)
    if (
      actual?.results.length &&
      actual.results.some(
        (r) =>
          milestoneDay(r.version.timeWindow!.start) < range.end &&
          milestoneDay(r.version.timeWindow!.end) + 1 > range.start
      )
    ) {
      return true
    }
    if (actual?.results.length && !actual.note) {
      return false
    }
    return (
      !f.deliveries.some((d) => d.timeWindow) ||
      f.deliveries.some(
        (d) =>
          d.timeWindow &&
          plannedDay(d.timeWindow.start) < range.end &&
          plannedDay(d.timeWindow.end) > range.start
      )
    )
  })
  const { lanes, versionHeight } = milestoneVersionLanes(versions, showActual ? 68 : 52)
  function changeField(id: string, field: 'title' | 'owner', value: string) {
    touch(id)
    props.editField((d) => updateMilestoneFeature(d, id, (f) => ({ ...f, [field]: value })))
  }
  function removeMaintenance(feature: MilestoneFeature, id: string) {
    touch(feature.id)
    edit((d) =>
      updateMilestoneFeature(d, feature.id, (f) => ({
        ...f,
        deliveries: f.deliveries.filter((p) => p.id !== id || p.phase !== 'Maintain')
      }))
    )
    toast('已删除此段 Maintain，可撤销')
  }
  function arrange(feature: MilestoneFeature, undated?: MilestoneDelivery) {
    if (!enabled) {
      return
    }
    touch(feature.id)
    const start = Math.max(today, Math.floor(range.start), latestFeatureEnd(feature))
    const created = newMilestoneDelivery(undated?.phase ?? 'Maintain', start)
    if (!created) {
      toast.error('超出可记录的日期范围')
      return
    }
    const delivery = { ...created, ...(undated ? { id: undated.id } : {}) }
    const next = updateMilestoneFeature(draft, feature.id, (f) => ({
      ...f,
      deliveries: orderMilestoneDeliveries(
        undated
          ? f.deliveries.map((p) => (p.id === undated.id ? delivery : p))
          : [...f.deliveries, delivery]
      )
    }))
    if (milestoneLaneConflict(next)) {
      toast.error('同一特性的安排不能重叠')
      return
    }
    edit(() => next)
    if (start + 7 > range.end) {
      props.navigate(milestoneDate(start - 3))
    }
  }
  return (
    <>
      {showActual && facts.readers}
      <MilestoneSdlcToolbar
        actual={facts}
        editing={editing}
        showActual={showActual}
        onChange={setShowActual}
        featureCount={features.length}
        totalCount={visible.material.features.length}
        ownerCount={new Set(features.map((f) => f.owner.trim()).filter(Boolean)).size}
      />
      <MilestoneRangeToolbar
        range={range}
        today={today}
        navigate={props.navigate}
        rangeOnly={props.rangeOnly}
        onRangeOnly={props.onRangeOnly}
      />
      <div
        ref={viewport}
        className="wb-ml-scroll"
        data-contextual-tour-target="milestone-schedule"
        aria-label="特性交付泳道"
        {...scrollProps}
      >
        <MilestoneNavigation
          nodes={draft.material.milestones}
          origin={origin}
          width={canvasWidth}
          enabled={enabled}
          visibleDate={() => milestoneDate(Math.max(today, Math.floor(range.start)))}
          {...milestoneNodeActions(
            draft.material.milestones,
            edit,
            props.editField,
            props.navigate
          )}
        />
        <div className="wb-ml-canvas" style={{ width: canvasWidth + labelWidth }}>
          <MilestoneDayGrid
            days={days}
            versions={showActual ? [] : versions}
            origin={origin}
            canvasWidth={canvasWidth}
            versionHeight={versionHeight}
          />
          <div className="wb-ml-board-header">
            <MilestoneVersionRow
              addFeature={() => props.addFeature(milestoneDate(Math.floor(range.start)), range.end)}
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
            <MilestoneDayAxis
              days={days}
              today={today}
              canvasWidth={canvasWidth}
              year={milestoneDate(Math.floor(range.start)).slice(0, 4)}
            />
          </div>
          {features.map((f) => {
            const actual = layouts.get(f.id)
            return (
              <div
                key={f.id}
                className="wb-ml-row"
                style={actual ? { minHeight: 88 + (actual.lanes - 1) * 36 } : undefined}
                data-milestone-feature={f.id}
              >
                <div className="wb-ml-label wb-ml-feature" data-ml-stop-pan>
                  <div className="wb-ml-feature-info">
                    <div className="wb-ml-feature-heading">
                      <MilestoneField
                        label="特性名称"
                        autoFocus={f.id === props.newFeature}
                        value={f.title}
                        editable={enabled}
                        required
                        validationAttempt={props.validationAttempt}
                        maxLength={200}
                        onChange={(title) => changeField(f.id, 'title', title)}
                      />
                      {editing && !showActual && (
                        <div className="wb-ml-feature-actions">
                          <MilestoneIconButton
                            className="wb-ml-cell-button"
                            label="添加 Maintain"
                            disabled={!enabled}
                            onClick={() => arrange(f)}
                          >
                            <Wrench size={14} />
                          </MilestoneIconButton>
                          <MilestoneIconButton
                            label="删除特性"
                            disabled={!enabled}
                            onClick={() => props.remove(f)}
                          >
                            <X size={14} />
                          </MilestoneIconButton>
                        </div>
                      )}
                    </div>
                    <div className="wb-ml-feature-meta">
                      <MilestoneField
                        label="负责人"
                        placeholder="负责人（选填）"
                        value={f.owner}
                        editable={enabled}
                        maxLength={100}
                        onChange={(owner) => changeField(f.id, 'owner', owner)}
                      />
                    </div>
                    {showActual && (
                      <small className="wb-ml-plan-reference">
                        规划：
                        {f.deliveries
                          .map(
                            (d) =>
                              `${d.phase} ${
                                d.timeWindow
                                  ? `${d.timeWindow.start.slice(0, 10)}—${d.timeWindow.end.slice(0, 10)}`
                                  : '未记录日期'
                              }`
                          )
                          .join('；')}
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
                      origin={origin}
                      end={end}
                      range={range}
                      enabled={enabled}
                      gesture={gesture}
                      remove={(id) => removeMaintenance(f, id)}
                      arrange={(d) => arrange(f, d)}
                    />
                  )}
                </div>
              </div>
            )
          })}
          {!features.length && (
            <div className="wb-ml-empty-row">
              <div className="wb-ml-label" />
              <div className="wb-ml-track" style={{ width: canvasWidth }} />
            </div>
          )}
          {today >= origin && today <= end && (
            <div
              className="wb-ml-today"
              style={{
                left: labelWidth + (actualDay(new Date().toISOString()) - origin) * width,
                top: versionHeight + 40
              }}
              aria-hidden="true"
            />
          )}
        </div>
      </div>
    </>
  )
}
