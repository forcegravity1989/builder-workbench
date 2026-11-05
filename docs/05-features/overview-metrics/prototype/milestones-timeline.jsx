import { workCalendarDay } from '../../../../src/shared/workbench/work-calendar.ts'
import { MilestoneAxis } from './milestones-roadmap.jsx'
import { InlineField, WeekName } from './milestones-fields.jsx'
import { IconAction } from '../../version-workspace/prototype/g2-icon-action.jsx'
import { calendarFor, dayWidth, labelWidth, planWeek, nextVersion } from './milestones-calendar.js'
import { currentDay, sampleActual, actualVersions } from './milestones-data.js'
import {
  day,
  dateOf,
  dayMs,
  phases,
  isRest,
  laneConflict,
  settleWindows,
  adjustVersion,
  adjustDelivery
} from './milestones-sdlc.js'
// eslint-disable-next-line no-unused-vars
const { React, useState, useRef, useEffect, Plus, X, ExternalLink, RefreshCw } =
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
  onDelete,
  onVersion,
  onReorder,
  newFeature,
  onAdd,
  onNameWeek,
  onApply,
  onMilestone
}) {
  const scroll = useRef(null),
    drag = useRef(null),
    pan = useRef(null),
    ordering = useRef(null)
  const [preview, setPreview] = useState(null),
    [dragWarning, setDragWarning] = useState(''),
    [showActual, setShowActual] = useState(false),
    [dropRow, setDropRow] = useState(null)
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
  const baseCalendar = calendarFor({ ...plan, versions: [...plan.versions, ...versions] })
  const start = baseCalendar.start / dayMs,
    end = baseCalendar.end / dayMs + 1
  const totalWidth = (end - start) * dayWidth
  const x = (value) => (value - start) * dayWidth
  const days = Array.from({ length: end - start }, (_, i) => start + i)
  const versionById = new Map(display.versions.map((v) => [v.id, v]))
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
  useEffect(() => {
    const date =
      navigation.date.slice(0, 7) === currentDay.slice(0, 7) && navigation.sequence === 0
        ? currentDay
        : navigation.date
    scroll.current?.scrollTo({ left: Math.max(0, (day(date) - start - 1) * dayWidth) })
  }, [navigation, start])
  const beginDrag = (event, gesture) => {
    if (!canEdit || event.button !== 0) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    setDragWarning('')
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
    let draft = gesture.base,
      targetId
    const delivery = draft.features.find((f) => f.id === gesture.id).deliveries[gesture.index]
    if (!delivery.stages.length) {
      return draft
    }
    if (gesture.mode === 'move' && delta) {
      const targetDay =
        (gesture.grabDay ?? (delivery.stages[0].start + delivery.stages.at(-1).end) / 2) + delta
      const candidates = draft.versions.filter(
        (v) => day(v.start) <= targetDay && day(v.end) + 1 > targetDay
      )
      if (candidates.length > 1) {
        setDragWarning('此日期有多个版本，请拖至明确的版本范围')
        return null
      }
      const target = candidates[0]
      targetId = target?.id
      if (!target) {
        const week = baseCalendar.weeks.find(
          (w) => day(w.start) <= targetDay && day(w.start) + 7 > targetDay
        )
        if (week) {
          const used = planWeek(draft, week)
          draft = used.plan
          targetId = used.version.id
        }
      }
    }
    const target = draft.versions.find((v) => v.id === (targetId || delivery.versionId))
    if (
      gesture.mode === 'move' &&
      delivery.stages.at(-1).end - delivery.stages[0].start >
        day(target.end) + 1 - day(target.start)
    ) {
      setDragWarning(`${target.name} 放不下当前安排，请先拉长该版本或缩短本段`)
      return null
    }
    let next = adjustDelivery(draft, gesture.id, gesture.index, gesture.mode, delta, targetId)
    const moved = next.features.find((f) => f.id === gesture.id)
    const first = moved.deliveries[0],
      maintain = moved.deliveries[1]
    if (
      gesture.mode === 'move' &&
      gesture.index === 0 &&
      target.id !== delivery.versionId &&
      maintain?.stages.length &&
      (first.versionId === maintain.versionId || maintain.stages[0].start < first.stages.at(-1).end)
    ) {
      const following = nextVersion(next, target.end)
      const duration = maintain.stages.at(-1).end - maintain.stages[0].start
      if (duration > day(following.version.end) + 1 - day(following.version.start)) {
        setDragWarning(`${following.version.name} 放不下维护段，请先调整该版本或维护时长`)
        return null
      }
      next = adjustDelivery(
        following.plan,
        gesture.id,
        1,
        'move',
        day(following.version.start) - maintain.stages[0].start,
        following.version.id
      )
    }
    return next
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
    const next = settled.plan
    if (laneConflict(next)) {
      setDragWarning('本特性的另一段已在该版本，请先调整另一段')
      return null
    }
    setDragWarning('')
    return next
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
    const label = `${feature.title} ${versionById.get(delivery.versionId)?.name} ${first.phase === 'Maintain' ? 'Maintain' : '上线'}整段 · ${plannedTime(first.start)}—${short(dateOf(Math.ceil(last.end) - 1))}${last.end % 1 === 0.5 ? ' 上午' : ''} · 计划`
    return (
      <div
        key={delivery.versionId}
        className={`ml-delivery-bar ${canEdit ? 'editable' : ''}`}
        style={{ left: x(first.start), width: (last.end - first.start) * dayWidth, top: 31 }}
      >
        <button
          className="ml-delivery-body"
          aria-label={label}
          title={`${label}；内部为阶段比例示意`}
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
              {(stage.end - stage.start) * dayWidth >= 38
                ? stage.phase
                : stage.phase.slice(0, stage.phase === 'Deploy' ? 2 : 1)}
            </span>
          ))}
        </button>
        {canEdit &&
          handle(
            { ...gesture, mode: 'start' },
            `${feature.title} ${versionById.get(delivery.versionId)?.name} 整段开始：拖动调整`,
            'start'
          )}
        {canEdit &&
          handle(
            { ...gesture, mode: 'end' },
            `${feature.title} ${versionById.get(delivery.versionId)?.name} 整段结束：拖动调整`,
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
        {canEdit && (
          <button className="btn btn-ghost" onClick={onAdd}>
            <Plus size={14} />
            添加特性
          </button>
        )}
        <span className="ml-planning-count">
          {display.features.length} 个特性 ·{' '}
          {new Set(display.features.map((f) => f.owner.trim()).filter(Boolean)).size} 位负责人
        </span>
        <div className="ml-stage-legend" aria-label={showActual ? '实际图例' : 'SDLC 阶段图例'}>
          {showActual ? (
            <span>条长：版本周期 · 点击查看版本</span>
          ) : (
            phases.map((phase) => (
              <span key={phase}>
                <i className={`phase-${phase.toLowerCase()}`} />
                {phase}
              </span>
            ))
          )}
        </div>
        {dragWarning && (
          <span className="ml-drag-warning" role="status">
            {dragWarning}
          </span>
        )}
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
      <div
        className="ml-timeline-scroll"
        ref={scroll}
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
          if (e.button !== 0 || e.target.closest('button,input,a,label,summary,details')) {
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
          onOpen={(item) => onMilestone(item, canEdit)}
          visibleDate={() =>
            dateOf(start + Math.floor((scroll.current?.scrollLeft || 0) / dayWidth) + 1)
          }
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
                            ? '拖动日期整体平移；拖版本两端调整起止'
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
                {navigation.date.slice(0, 7).replace('-', ' 年 ')} 月
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
          {display.features.map((feature, index) => (
            <div
              key={feature.id}
              className={`ml-timeline-row ${dropRow?.id === feature.id ? `ml-row-drop-${dropRow.side}` : ''}`}
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
              onDragOver={(e) => {
                if (!ordering.current || !canEdit) {
                  return
                }
                e.preventDefault()
                const bounds = e.currentTarget.getBoundingClientRect()
                setDropRow({
                  id: feature.id,
                  side: e.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
                })
                const area = scroll.current.getBoundingClientRect()
                if (e.clientY > area.bottom - 35) {
                  scroll.current.scrollTop += 12
                }
                if (e.clientY < area.top + 130) {
                  scroll.current.scrollTop -= 12
                }
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (ordering.current && dropRow) {
                  onReorder(ordering.current, dropRow.id, dropRow.side)
                }
                ordering.current = null
                setDropRow(null)
              }}
            >
              <div className="ml-sticky-label">
                <div className="ml-feature-heading">
                  {canEdit && (
                    <button
                      className="ml-order-handle"
                      draggable
                      title="拖动排序；Alt+上下键移动"
                      aria-label={`调整 ${feature.title} 顺序`}
                      onDragStart={(e) => {
                        ordering.current = feature.id
                        e.dataTransfer.setData('text/plain', feature.id)
                      }}
                      onDragEnd={() => {
                        ordering.current = null
                        setDropRow(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.altKey && ['ArrowUp', 'ArrowDown'].includes(e.key)) {
                          e.preventDefault()
                          const target = display.features[index + (e.key === 'ArrowUp' ? -1 : 1)]
                          if (target) {
                            onReorder(
                              feature.id,
                              target.id,
                              e.key === 'ArrowUp' ? 'before' : 'after'
                            )
                          }
                        }
                      }}
                    >
                      ⠿
                    </button>
                  )}
                  {canEdit ? (
                    <InlineField
                      value={feature.title}
                      label="特性名称"
                      placeholder="特性名称"
                      autoFocus={newFeature === feature.id}
                      className="ml-feature-name"
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
                        placeholder="负责人"
                        change={(owner) => onChangeFeature(feature.id, { owner })}
                      />
                    ) : (
                      <small>{feature.owner}</small>
                    )}
                  </div>
                </div>
                {showActual && (
                  <small className="ml-result-caption">
                    规划：
                    {feature.deliveries
                      .map(
                        (d) =>
                          `${versionById.get(d.versionId)?.name} ${d.stages[0]?.phase === 'Maintain' ? '维护' : '上线'}`
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
                {!showActual && (
                  <svg className="ml-sdlc-connection" aria-hidden="true">
                    {feature.deliveries.slice(1).map((d, i) => {
                      const previous = feature.deliveries[i]
                      if (!previous.stages.length || !d.stages.length) {
                        return null
                      }
                      const left = x(previous.stages.at(-1).end)
                      const right = x(d.stages[0].start)
                      return right > left ? (
                        <path key={d.versionId} d={`M ${left} 45 H ${right}`} />
                      ) : null
                    })}
                  </svg>
                )}
                {showActual
                  ? actualByFeature.get(feature.id).rows.map((result) => actualBar(feature, result))
                  : feature.deliveries.map((delivery, i) => plannedBar(feature, delivery, i))}
              </div>
              {canEdit && (
                <div className="ml-row-actions">
                  <IconAction
                    label={`移除 ${feature.title || '特性'}`}
                    icon={X}
                    onClick={() => onDelete(feature)}
                  />
                </div>
              )}
            </div>
          ))}
          {!display.features.length && (
            <div className="ml-empty-lanes">
              <div className="ml-sticky-label">还没有特性</div>
              <div className="ml-empty-grid" style={{ width: totalWidth }}>
                添加特性后，整段安排上线版与 Maintain 版
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
