import { workCalendarDay } from '../../../../src/shared/workbench/work-calendar.ts'
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left.js'
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right.js'
import LocateFixed from 'lucide-react/dist/esm/icons/locate-fixed.js'
import ListPlus from 'lucide-react/dist/esm/icons/list-plus.js'
import Wrench from 'lucide-react/dist/esm/icons/wrench.js'
import Trash2 from 'lucide-react/dist/esm/icons/trash-2.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import { MilestoneAxis } from './milestones-roadmap.jsx'
import { InlineField, WeekName } from './milestones-fields.jsx'
import { IconAction } from '../../version-workspace/prototype/g2-icon-action.jsx'
import { calendarFor, dayWidth, labelWidth } from './milestones-calendar.js'
import { currentDay, sampleActual, actualVersions, storageKey } from './milestones-data.js'
import {
  day,
  dateOf,
  dayMs,
  phases,
  isRest,
  settleWindows,
  adjustVersion,
  adjustDelivery,
  latestFeatureEnd
} from './milestones-sdlc.js'
// eslint-disable-next-line no-unused-vars
const { React, useState, useRef, useEffect, ExternalLink, RefreshCw } =
  window.BWPrototypeDependencies
const short = (date) => date.slice(5).replace('-', '/')
const plannedTime = (value) =>
  `${short(dateOf(value))}${Math.abs((value % 1) - 0.5) < 1e-8 ? ' 下午' : ''}`
export function Timeline({
  plan,
  planning,
  navigation,
  actualScenario,
  onActualScenario,
  onChangeFeature,
  onRenameVersion,
  onVersion,
  onMaintain,
  onRemoveMaintenance,
  onDelete,
  onNavigate,
  onNotice,
  validationAttempt,
  newFeature,
  onAdd,
  onNameWeek,
  onApply,
  onAddMilestone,
  onRemoveMilestone,
  onChangeMilestone
}) {
  const scroll = useRef(null),
    drag = useRef(null),
    pan = useRef(null),
    editingOrder = useRef(null),
    editingPins = useRef(new Set())
  const [preview, setPreview] = useState(null),
    [dragWarning, setDragWarning] = useState(''),
    [showActual, setShowActual] = useState(false),
    [rangeOnly, setRangeOnly] = useState(true),
    [visibleRange, setVisibleRange] = useState({
      start: day(navigation.date),
      end: day(navigation.date) + 28
    })
  const actualByFeature = new Map(
    plan.features.map((feature) => [feature.id, sampleActual(feature, actualScenario)])
  )
  const canEdit = planning && !showActual
  const versions = actualScenario === 'error' ? [] : actualVersions
  const display = showActual
    ? {
        ...plan,
        versions: [
          ...plan.versions,
          ...versions.filter((v) => !plan.versions.some((p) => p.id === v.id))
        ]
      }
    : preview || plan
  const actualVersionById = new Map(versions.map((v) => [v.id, v]))
  // Keep the calendar scale and scroll position stable while changing the source.
  const baseCalendar = calendarFor(
    { ...plan, versions: [...plan.versions, ...versions] },
    navigation.date
  )
  const start = baseCalendar.start / dayMs,
    end = baseCalendar.end / dayMs + 1
  const totalWidth = (end - start) * dayWidth
  const x = (value) => (value - start) * dayWidth
  const days = Array.from({ length: end - start }, (_, i) => start + i)
  const lanesFor = (items) => {
    const ends = [],
      lanes = new Map()
    for (const v of items.toSorted((a, b) => a.start.localeCompare(b.start))) {
      let lane = ends.findIndex((end) => end < v.start)
      if (lane === -1) {
        lane = ends.length
      }
      ends[lane] = v.end
      lanes.set(v.id, lane)
    }
    return lanes
  }
  const versionLanes = lanesFor(display.versions),
    actualLanes = lanesFor(versions)
  const headerHeight = showActual ? 68 : 52
  const versionHeight =
    Math.max(1, ...[...versionLanes.values()].map((lane) => lane + 1)) * headerHeight
  const blankWeeks = baseCalendar.weeks.filter(
    (w) => !display.versions.some((v) => v.start <= w.end && v.end >= w.start)
  )
  if (!planning) {
    editingPins.current.clear()
  }
  const chronological = display.features.toSorted(
    (a, b) => latestFeatureEnd(b) - latestFeatureEnd(a)
  )
  if (!planning || !editingOrder.current) {
    editingOrder.current = chronological.map((f) => f.id)
  }
  const newIds = display.features
    .filter((f) => !editingOrder.current.includes(f.id))
    .map((f) => f.id)
  if (newIds.length) {
    editingOrder.current = [...newIds, ...editingOrder.current]
  }
  const ordered = canEdit
    ? display.features.toSorted(
        (a, b) => editingOrder.current.indexOf(a.id) - editingOrder.current.indexOf(b.id)
      )
    : chronological
  const visibleFeatures = ordered.filter((feature) => {
    if (
      !rangeOnly ||
      !feature.title.trim() ||
      (canEdit && (feature.id === newFeature || editingPins.current.has(feature.id)))
    ) {
      return true
    }
    const results = actualByFeature.get(feature.id).rows
    if (showActual && results.length) {
      return results.some(
        (r) =>
          day(r.version.start) < visibleRange.end && day(r.version.end) + 1 > visibleRange.start
      )
    }
    return feature.deliveries.some((d) =>
      d.stages.some((s) => s.start < visibleRange.end && s.end > visibleRange.start)
    )
  })
  const readRange = () => {
    const el = scroll.current
    if (!el) {
      return
    }
    const left = start + el.scrollLeft / dayWidth
    const right = left + Math.max(1, (el.clientWidth - labelWidth) / dayWidth)
    setVisibleRange((old) =>
      old.start === left && old.end === right ? old : { start: left, end: right }
    )
    try {
      localStorage.setItem(`${storageKey}-date`, dateOf(left))
    } catch {
      /* Optional view preference. */
    }
  }
  const previousStart = useRef(start)
  useEffect(() => {
    if (scroll.current) {
      scroll.current.scrollLeft += (previousStart.current - start) * dayWidth
    }
    previousStart.current = start
    readRange()
  }, [start])
  useEffect(() => {
    scroll.current?.scrollTo({ left: Math.max(0, (day(navigation.date) - start) * dayWidth) })
    readRange()
  }, [navigation])
  useEffect(() => {
    const observer = new ResizeObserver(readRange)
    if (scroll.current) {
      observer.observe(scroll.current)
    }
    return () => observer.disconnect()
  }, [start])
  useEffect(() => {
    onNotice(dragWarning)
  }, [dragWarning])
  const beginDrag = (event, gesture) => {
    if (!canEdit || event.button !== 0) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    setDragWarning('')
    if (gesture.kind === 'delivery') {
      editingPins.current.add(gesture.id)
    }
    drag.current = {
      ...gesture,
      originX: event.clientX,
      grabDay:
        start +
        (event.clientX -
          scroll.current.getBoundingClientRect().left -
          labelWidth +
          scroll.current.scrollLeft) /
          dayWidth,
      left: scroll.current.scrollLeft,
      base: plan,
      next: plan
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const changed = (gesture, delta) => {
    if (gesture.kind === 'version') {
      return adjustVersion(gesture.base, gesture.id, gesture.mode, delta)
    }
    return adjustDelivery(gesture.base, gesture.id, gesture.index, gesture.mode, delta)
  }
  const stepFor = (g) => (g.kind === 'version' ? 1 : 0.5)
  const checkedChange = (gesture, delta) => {
    const candidate = changed(gesture, delta)
    if (!candidate) {
      return null
    }
    const settled = settleWindows(gesture.base, candidate)
    if (settled.conflict) {
      setDragWarning(settled.conflict)
      return null
    }
    setDragWarning('')
    return settled.plan
  }
  const movePointer = (event) => {
    if (drag.current) {
      const g = drag.current,
        bounds = scroll.current.getBoundingClientRect()
      if (event.clientX > bounds.right - 32) {
        scroll.current.scrollLeft += 12
      } else if (event.clientX < bounds.left + labelWidth + 20) {
        scroll.current.scrollLeft -= 12
      }
      const step = stepFor(g)
      const delta =
        Math.round(
          (event.clientX - g.originX + scroll.current.scrollLeft - g.left) / dayWidth / step
        ) * step
      g.next = checkedChange(g, delta) || (g.mode === 'move' ? g.base : g.next)
      setPreview(g.next)
    } else if (pan.current) {
      scroll.current.scrollLeft = pan.current.left + pan.current.x - event.clientX
    }
  }
  const finish = (cancel = false) => {
    if (drag.current && !cancel) {
      onApply(drag.current.next)
    }
    drag.current = null
    pan.current = null
    setPreview(null)
    if (cancel) {
      setDragWarning('')
    }
  }
  const keyboardAdjust = (event, gesture) => {
    if (!canEdit || !['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return
    }
    event.preventDefault()
    if (gesture.kind === 'delivery') {
      editingPins.current.add(gesture.id)
    }
    const delta = (event.key === 'ArrowLeft' ? -1 : 1) * stepFor(gesture)
    const next = checkedChange({ ...gesture, base: plan }, delta)
    if (next) {
      onApply(next)
    }
  }
  const handle = (gesture, label, edge) => (
    <button
      key={edge}
      className={`ml-resize ${edge}`}
      aria-label={label}
      title={label}
      onPointerDown={(e) => beginDrag(e, gesture)}
      onKeyDown={(e) => keyboardAdjust(e, gesture)}
    />
  )
  const plannedBar = (feature, delivery, index) => {
    const first = delivery.stages[0],
      last = delivery.stages.at(-1)
    if (!first) {
      return null
    }
    const gesture = { kind: 'delivery', id: feature.id, index, mode: 'move' }
    const label = `${feature.title} ${first.phase} · ${plannedTime(first.start)}—${short(dateOf(Math.ceil(last.end) - 1))}${last.end % 1 === 0.5 ? ' 上午' : ''} · 计划`
    return (
      <div
        key={delivery.id || index}
        className={`ml-delivery-bar ${canEdit ? 'editable' : ''}`}
        data-delivery-id={delivery.id}
        style={{ left: x(first.start), width: (last.end - first.start) * dayWidth, top: 31 }}
      >
        <button
          className="ml-delivery-body"
          aria-label={label}
          title={`${label}；拖动移动，两端调整日期，可跨版本`}
          onPointerDown={canEdit ? (e) => beginDrag(e, gesture) : undefined}
          onKeyDown={canEdit ? (e) => keyboardAdjust(e, gesture) : undefined}
        >
          {delivery.stages.map((stage) => (
            <span
              key={stage.phase}
              className={`phase-${stage.phase.toLowerCase()}`}
              style={{
                flex: `0 0 ${((stage.end - stage.start) / (last.end - first.start)) * 100}%`
              }}
            >
              <b
                className="ml-phase-label"
                style={{
                  left: (Math.max(stage.start, visibleRange.start) - first.start) * dayWidth,
                  width:
                    Math.max(
                      0,
                      Math.min(stage.end, visibleRange.end) -
                        Math.max(stage.start, visibleRange.start)
                    ) * dayWidth
                }}
              >
                {stage.phase}
              </b>
            </span>
          ))}
        </button>
        {canEdit &&
          first.phase === 'Maintain' &&
          last.end > visibleRange.start &&
          first.start < visibleRange.end && (
            <div
              className="ml-delivery-tools"
              style={{
                left:
                  ((Math.max(first.start, visibleRange.start) +
                    Math.min(last.end, visibleRange.end)) /
                    2 -
                    first.start) *
                  dayWidth
              }}
            >
              <IconAction
                className="ml-maintain-delete"
                label="删除此段 Maintain"
                icon={Trash2}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  editingPins.current.add(feature.id)
                  event.currentTarget
                    .closest('[data-feature-id]')
                    ?.querySelector('[aria-label="添加 Maintain"]')
                    ?.focus({ preventScroll: true })
                  onRemoveMaintenance(feature.id, delivery.id)
                }}
              />
            </div>
          )}
        {canEdit &&
          handle(
            { ...gesture, mode: 'start' },
            `${feature.title} ${first.phase} 开始：拖动调整`,
            'start'
          )}
        {canEdit &&
          handle(
            { ...gesture, mode: 'end' },
            `${feature.title} ${first.phase} 结束：拖动调整`,
            'end'
          )}
      </div>
    )
  }
  const actualBar = (feature, result) => {
    const v = result.version
    const complete = result.outcome === 'met'
    const status =
      result.kind === 'Maintain'
        ? complete
          ? '维护完成'
          : '维护未完成'
        : complete
          ? '已上线'
          : '未上线'
    const label = `${feature.title} ${v.name} · ${status}`
    return (
      <button
        key={v.id}
        className={`ml-result-bar ${complete ? 'met' : 'not-met'}`}
        style={{
          left: x(day(v.start)),
          width: (day(v.end) - day(v.start) + 1) * dayWidth,
          top: 31 + actualLanes.get(v.id) * 36
        }}
        aria-label={label}
        title={`${label}；${short(v.start)}—${short(v.end)} 为版本周期，并非特性实测工期。原型样例：#${result.number} → ${result.goalId}，验收 PR 已合入。点击查看版本。`}
        onClick={() => onVersion(v.id)}
      >
        <span aria-hidden="true">{complete ? '✓' : '○'}</span>
        {v.name} · {status}
      </button>
    )
  }
  return (
    <>
      <div className="ml-sdlc-toolbar">
        <span className="ml-planning-count">
          {visibleFeatures.length} / {display.features.length} 个特性 ·{' '}
          {new Set(visibleFeatures.map((f) => f.owner.trim()).filter(Boolean)).size} 位负责人
        </span>
        <div className="ml-stage-legend" aria-label={showActual ? '实际图例' : '工作阶段图例'}>
          {showActual ? (
            <span>条长：版本周期 · 点击查看版本</span>
          ) : (
            [
              <span key="planned">计划</span>,
              ...phases.map((phase) => (
                <span key={phase}>
                  <i className={`phase-${phase.toLowerCase()}`} />
                  {phase}
                </span>
              ))
            ]
          )}
        </div>
        <label className="ml-show-actual">
          <input
            type="checkbox"
            checked={showActual}
            onChange={(e) => setShowActual(e.target.checked)}
          />
          显示实际
        </label>
        {showActual && (
          <div className="ml-actual-refresh" role="status">
            <span>
              {{
                error: '验收读取失败',
                unlinked: '未关联特性',
                ambiguous: '特性匹配不唯一'
              }[actualScenario] || '已归档验收结果'}
            </span>
            <IconAction
              label="刷新验收结果"
              icon={RefreshCw}
              onClick={() => onActualScenario('normal')}
            />
          </div>
        )}
      </div>
      <div className="ml-range-toolbar">
        <div className="ml-actions">
          <IconAction
            label="向前查看一周"
            icon={ChevronLeft}
            onClick={() => onNavigate(dateOf(visibleRange.start - 7))}
          />
          <input
            className="input ml-jump-date"
            type="date"
            aria-label="定位日期"
            value={dateOf(visibleRange.start)}
            onChange={(e) => e.target.value && onNavigate(e.target.value)}
          />
          <span className="ml-visible-until">— {dateOf(Math.ceil(visibleRange.end) - 1)}</span>
          <IconAction
            label="向后查看一周"
            icon={ChevronRight}
            onClick={() => onNavigate(dateOf(visibleRange.start + 7))}
          />
          <IconAction
            label="定位今天，保留前十天"
            icon={LocateFixed}
            onClick={() => onNavigate(dateOf(day(currentDay) - 10))}
          />
        </div>
        <select
          className="input"
          aria-label="特性显示范围"
          value={rangeOnly ? 'range' : 'all'}
          onChange={(e) => setRangeOnly(e.target.value === 'range')}
        >
          <option value="range">当前时间范围有安排</option>
          <option value="all">全部特性</option>
        </select>
      </div>
      <div
        className="ml-timeline-scroll"
        ref={scroll}
        onScroll={readRange}
        tabIndex={0}
        aria-label="特性版本排期，每格一天"
        onPointerMove={movePointer}
        onPointerUp={() => finish()}
        onPointerCancel={() => finish(true)}
        onLostPointerCapture={() => {
          if (drag.current || pan.current) {
            finish(true)
          }
        }}
        onKeyDown={(e) => {
          if (
            drag.current &&
            (e.ctrlKey || e.metaKey) &&
            ['z', 'y'].includes(e.key.toLowerCase())
          ) {
            e.preventDefault()
            e.stopPropagation()
            finish(true)
            return
          }
          if (e.key === 'Escape') {
            finish(true)
          }
        }}
        onPointerDown={(e) => {
          if (e.button !== 0 || e.target.closest('button,input,textarea,a,label,summary,details')) {
            return
          }
          pan.current = { x: e.clientX, left: scroll.current.scrollLeft }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
      >
        <MilestoneAxis
          milestones={plan.milestones}
          planning={canEdit}
          start={start}
          width={totalWidth}
          onAdd={() =>
            onAddMilestone({
              date: dateOf(Math.max(day(currentDay), Math.floor(visibleRange.start))),
              outcome: ''
            })
          }
          onChange={onChangeMilestone}
          onRemove={onRemoveMilestone}
        />
        <div className="ml-timeline-canvas" style={{ width: totalWidth + labelWidth }}>
          <div
            className="ml-days-background"
            style={{ left: labelWidth, width: totalWidth, top: versionHeight + 40 }}
            aria-hidden="true"
          >
            {days.map((d) => (
              <i
                key={d}
                className={isRest(d) ? 'rest' : ''}
                style={{ left: x(d), width: dayWidth }}
              />
            ))}
            {!showActual &&
              display.versions.map((version, index) => (
                <div
                  key={version.id}
                  className="ml-version-boundary"
                  data-alternate={index % 2}
                  style={{
                    left: x(day(version.start)),
                    width: (day(version.end) - day(version.start) + 1) * dayWidth
                  }}
                />
              ))}
          </div>
          <div className="ml-board-header">
            <div className="ml-version-row" style={{ height: versionHeight }}>
              <div className="ml-sticky-label">
                {canEdit && (
                  <IconAction
                    className="ml-cell-add"
                    label="添加特性"
                    icon={ListPlus}
                    onClick={() => onAdd(dateOf(Math.floor(visibleRange.start)), visibleRange.end)}
                  />
                )}
                特性 / 负责人<small>{showActual ? '版本日期对照' : '计划 · 日排期'}</small>
              </div>
              <div className="ml-version-track" style={{ width: totalWidth }}>
                {!showActual &&
                  blankWeeks.map((w) => (
                    <div
                      className="ml-week-slot"
                      key={w.id}
                      style={{ left: x(day(w.start)), width: 5 * dayWidth }}
                    >
                      {canEdit ? (
                        <WeekName week={w} commit={(name) => onNameWeek(w, name)} />
                      ) : (
                        <span>未规划</span>
                      )}
                      <small>
                        {short(w.start)}—{short(w.end)}
                      </small>
                    </div>
                  ))}
                {display.versions.map((v) => {
                  const editable = canEdit
                  const planned = plan.versions.find((p) => p.id === v.id)
                  const actual = actualVersionById.get(v.id)
                  const gesture = { kind: 'version', id: v.id, mode: 'move' }
                  const activeVersion = showActual ? actual : v
                  const active =
                    activeVersion?.start <= currentDay && activeVersion?.end >= currentDay
                  return (
                    <div
                      className={`ml-fixed-version ${active ? 'current' : ''}`}
                      key={v.id}
                      style={{
                        left: x(day(v.start)),
                        top: versionLanes.get(v.id) * headerHeight,
                        height: headerHeight,
                        width: (day(v.end) - day(v.start) + 1) * dayWidth
                      }}
                    >
                      {active && <span className="ml-current-version">当前</span>}
                      <div className="ml-version-title">
                        {editable && !v.hasExecution ? (
                          <InlineField
                            value={v.name}
                            label={`版本名称 ${v.name}`}
                            change={(name) => onRenameVersion(v.id, name)}
                            commit={(name, previous) => onRenameVersion(v.id, name, previous)}
                            className="ml-version-name"
                          />
                        ) : (
                          <strong>{v.name}</strong>
                        )}
                        <IconAction
                          label={`进入 ${v.name} 版本总览`}
                          icon={ExternalLink}
                          onClick={() => onVersion(v.id)}
                        />
                      </div>
                      <button
                        className={`ml-version-dates ${editable ? 'editable' : ''} ${showActual ? 'comparison' : ''}`}
                        title={
                          editable
                            ? '拖动调整版本日期；特性排期独立保留'
                            : showActual
                              ? '表头按里程碑规划定位；实际日期来自正式版本计划，结果条按实际日期绘制'
                              : '里程碑规划日期'
                        }
                        onPointerDown={editable ? (e) => beginDrag(e, gesture) : undefined}
                        onKeyDown={editable ? (e) => keyboardAdjust(e, gesture) : undefined}
                      >
                        {showActual ? (
                          <>
                            <span>
                              规划：
                              {planned ? `${short(planned.start)}—${short(planned.end)}` : '未安排'}
                            </span>
                            <span>
                              实际：
                              {actual
                                ? `${short(actual.start)}—${short(actual.end)}`
                                : actualScenario === 'error'
                                  ? '读取失败'
                                  : '暂无正式计划'}
                            </span>
                          </>
                        ) : (
                          `${short(v.start)}—${short(v.end)}`
                        )}
                      </button>
                      {editable &&
                        handle(
                          { ...gesture, mode: 'start' },
                          `${v.name} 版本开始：拖动调整，方向键一天`,
                          'start'
                        )}
                      {editable &&
                        handle(
                          { ...gesture, mode: 'end' },
                          `${v.name} 版本结束：拖动调整，方向键一天`,
                          'end'
                        )}
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="ml-day-row">
              <div className="ml-sticky-label">
                {dateOf(visibleRange.start).slice(0, 4)} 年
                <small>
                  {showActual ? '每格一天 · 结果条按实际日期' : '每格一天 · 整段按半天调整'}
                </small>
              </div>
              <div className="ml-day-track" style={{ width: totalWidth }}>
                {days.map((d) => {
                  const date = dateOf(d),
                    { badge } = workCalendarDay(date)
                  return (
                    <div
                      key={d}
                      className={`ml-day-cell ${isRest(d) ? 'rest' : ''} ${date === currentDay ? 'today' : ''}`}
                      style={{ width: dayWidth }}
                      title={`${date} · ${badge || (isRest(d) ? '休息日' : '工作日')}`}
                    >
                      <span>{short(date)}</span>
                      <small>
                        {
                          ['日', '一', '二', '三', '四', '五', '六'][
                            new Date(d * dayMs).getUTCDay()
                          ]
                        }{' '}
                        {badge && <b>{badge}</b>}
                      </small>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          {visibleFeatures.map((feature) => (
            <div
              key={feature.id}
              className="ml-timeline-row"
              data-feature-id={feature.id}
              style={
                showActual
                  ? {
                      minHeight:
                        88 +
                        Math.max(
                          0,
                          ...actualByFeature
                            .get(feature.id)
                            .rows.map((r) => actualLanes.get(r.versionId) || 0)
                        ) *
                          36
                    }
                  : undefined
              }
            >
              <div className="ml-sticky-label">
                {canEdit && (
                  <div className="ml-feature-actions">
                    <IconAction
                      className="ml-cell-action"
                      label="添加 Maintain"
                      icon={Wrench}
                      onClick={() => {
                        editingPins.current.add(feature.id)
                        onMaintain(
                          feature,
                          dateOf(Math.floor(visibleRange.start)),
                          visibleRange.end
                        )
                      }}
                    />
                    <IconAction
                      className="ml-feature-delete"
                      label="删除特性"
                      icon={X}
                      onClick={() => onDelete(feature)}
                    />
                  </div>
                )}
                <div className="ml-feature-heading">
                  {canEdit ? (
                    <InlineField
                      value={feature.title}
                      label="特性名称"
                      placeholder="特性名称"
                      autoFocus={newFeature === feature.id}
                      className="ml-feature-name"
                      forceInvalid={validationAttempt}
                      change={(title) => onChangeFeature(feature.id, { title })}
                    />
                  ) : (
                    <strong>{feature.title}</strong>
                  )}
                </div>
                <div className="ml-feature-meta">
                  <div className="ml-inline-owner">
                    {canEdit ? (
                      <InlineField
                        value={feature.owner}
                        label={`${feature.title} 负责人`}
                        placeholder="负责人（选填）"
                        required={false}
                        change={(owner) => onChangeFeature(feature.id, { owner })}
                      />
                    ) : (
                      <small>{feature.owner || '未指定负责人'}</small>
                    )}
                  </div>
                </div>
                {showActual && (
                  <small className="ml-result-caption">
                    规划：
                    {feature.deliveries
                      .map(
                        (d) =>
                          `${d.stages[0]?.phase} ${short(dateOf(d.stages[0].start))}—${short(dateOf(d.stages.at(-1).end - 1))}`
                      )
                      .join(' → ')}
                  </small>
                )}
                {showActual && actualByFeature.get(feature.id).note && (
                  <small className="ml-result-caption">
                    {actualByFeature.get(feature.id).note}
                  </small>
                )}
              </div>
              <div className="ml-track" style={{ width: totalWidth }}>
                {showActual
                  ? actualByFeature.get(feature.id).rows.map((result) => actualBar(feature, result))
                  : feature.deliveries.map((delivery, i) => plannedBar(feature, delivery, i))}
              </div>
            </div>
          ))}
          {!visibleFeatures.length && (
            <div className="ml-empty-lanes">
              <div className="ml-sticky-label">
                {display.features.length ? '当前范围没有安排' : '还没有特性'}
              </div>
              <div className="ml-empty-grid" style={{ width: totalWidth }}>
                {display.features.length ? (
                  <button className="btn btn-ghost" onClick={() => setRangeOnly(false)}>
                    查看全部特性
                  </button>
                ) : (
                  '添加特性后安排 Build 与 Maintain'
                )}
              </div>
            </div>
          )}
          <div
            className="ml-now-line"
            style={{ left: labelWidth + x(day(currentDay) + 0.5), top: versionHeight + 40 }}
            aria-hidden="true"
          />
        </div>
      </div>
    </>
  )
}
