import { InlineField, WeekName } from './milestones-fields.jsx'
import { IconAction } from '../../version-workspace/prototype/g2-icon-action.jsx'
import { calendarFor, dayWidth, labelWidth, planWeek } from './milestones-calendar.js'
import { currentDay } from './milestones-data.js'
import {
  day,
  dateOf,
  dayMs,
  phases,
  actualDay,
  actualAsOf,
  isRest,
  adjustVersion,
  adjustDelivery
} from './milestones-sdlc.js'
const { React, useState, useRef, useEffect, Plus, X, ExternalLink } = window.BWPrototypeDependencies
const short = (date) => date.slice(5).replace('-', '/')
const plannedTime = (value) => `${short(dateOf(value))} ${value % 1 ? '12:00' : '00:00'}`
const actualTime = (value) => (value ? value.slice(5, 16).replace('T', ' ') : '尚无完成记录')
export function Timeline({
  plan,
  planning,
  navigation,
  onChangeFeature,
  onRenameVersion,
  onDelete,
  onVersion,
  onReorder,
  newFeature,
  onAdd,
  onNameWeek,
  onApply
}) {
  const scroll = useRef(null),
    drag = useRef(null),
    pan = useRef(null),
    ordering = useRef(null)
  const [preview, setPreview] = useState(null),
    [showPlan, setShowPlan] = useState(false),
    [dropRow, setDropRow] = useState(null)
  const [calendarData, setCalendarData] = useState(null),
    [calendarStatus, setCalendarStatus] = useState('正在读取工作日历')
  const baseCalendar = calendarFor(plan)
  const start = baseCalendar.start / dayMs,
    end = baseCalendar.end / dayMs + 1
  const totalWidth = (end - start) * dayWidth
  const x = (value) => (value - start) * dayWidth
  const display = preview || plan
  const days = Array.from({ length: end - start }, (_, i) => start + i)
  const versionById = new Map(display.versions.map((v) => [v.id, v]))
  const laneEnds = [],
    versionLanes = new Map()
  for (const version of display.versions.toSorted((a, b) => a.start.localeCompare(b.start))) {
    let lane = laneEnds.findIndex((end) => end < version.start)
    if (lane === -1) {
      lane = laneEnds.length
    }
    laneEnds[lane] = version.end
    versionLanes.set(version.id, lane)
  }
  const versionHeight = Math.max(1, laneEnds.length) * 64
  const blankWeeks = baseCalendar.weeks.filter(
    (w) => !display.versions.some((v) => v.start <= w.end && v.end >= w.start)
  )
  useEffect(() => {
    const controller = new AbortController()
    fetch(new URL('prototype/calendar.local.json', window.location.href), {
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            response.status === 404
              ? '未配置华为日历，按普通周末显示'
              : '工作日历读取失败，按普通周末显示'
          )
        }
        const value = await response.json()
        if (
          !['years', 'workDays', 'restDays'].every((key) => Array.isArray(value[key])) ||
          ![...value.workDays, ...value.restDays].every(
            (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(day(d))
          )
        ) {
          throw new Error('工作日历格式无效，按普通周末显示')
        }
        setCalendarData(value)
        setCalendarStatus('BW 预置工作日历；未覆盖年份按普通周末显示')
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setCalendarStatus(error.message)
        }
      })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    const date =
      navigation.date.slice(0, 7) === currentDay.slice(0, 7) && navigation.sequence === 0
        ? currentDay
        : navigation.date
    scroll.current?.scrollTo({ left: Math.max(0, (day(date) - start - 1) * dayWidth) })
  }, [navigation, start])
  const effectiveCalendar = (value) =>
    calendarData?.years.map(String).includes(dateOf(value).slice(0, 4)) ? calendarData : null
  const beginDrag = (event, gesture) => {
    if (!planning || event.button !== 0) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    drag.current = {
      ...gesture,
      originX: event.clientX,
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
    if (gesture.mode === 'move' && delta) {
      const targetDay = delivery.stages[0].start + delta
      const candidates = draft.versions.filter(
        (v) => day(v.start) <= targetDay && day(v.end) + 1 > targetDay
      )
      const current = candidates.find((v) => v.id === delivery.versionId)
      if (!current && candidates.length > 1) {
        return draft
      }
      const target = current || candidates[0]
      if (target?.started) {
        return draft
      }
      targetId = target?.id
      if (!target) {
        const week = baseCalendar.weeks.find(
          (w) => day(w.start) <= targetDay && day(w.start) + 7 > targetDay
        )
        if (week) {
          const used = planWeek(draft, week)
          if (used.version.started) {
            return draft
          }
          draft = used.plan
          targetId = used.version.id
        }
      }
    }
    return adjustDelivery(
      draft,
      gesture.id,
      gesture.index,
      gesture.mode,
      gesture.stage,
      delta,
      targetId
    )
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
      const step = g.kind === 'version' ? 1 : 0.5
      const delta =
        Math.round(
          (event.clientX - g.originX + scroll.current.scrollLeft - g.left) / dayWidth / step
        ) * step
      g.next = changed(g, delta)
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
  }
  const keyboardAdjust = (event, gesture) => {
    if (!planning || !['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return
    }
    event.preventDefault()
    const delta = (event.key === 'ArrowLeft' ? -1 : 1) * (gesture.kind === 'version' ? 1 : 0.5)
    onApply(changed({ ...gesture, base: plan }, delta))
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
  const plannedBar = (feature, delivery, index, ghost = false) => {
    const version = versionById.get(delivery.versionId)
    const editable = planning && !version.started && !ghost
    return (
      <div
        className={`ml-phase-group ${ghost ? 'ghost' : ''}`}
        key={`${delivery.stages[0].phase}-${ghost}`}
      >
        {delivery.stages.map((s, stage) => {
          const gesture = { kind: 'delivery', id: feature.id, index, stage, mode: 'move' }
          const label = `${s.phase} · ${plannedTime(s.start)} — ${plannedTime(s.end)} · ${ghost ? '原计划，只读' : '计划'}`
          return (
            <div
              key={s.phase}
              className={`ml-phase phase-${s.phase.toLowerCase()} ${editable ? 'editable' : ''}`}
              style={{
                left: x(s.start),
                width: (s.end - s.start) * dayWidth,
                top: ghost ? 76 : 31
              }}
            >
              <button
                className="ml-phase-body"
                aria-label={label}
                title={label}
                onPointerDown={editable ? (e) => beginDrag(e, gesture) : undefined}
                onKeyDown={editable ? (e) => keyboardAdjust(e, gesture) : undefined}
                onDoubleClick={() => onVersion(version.id, feature)}
              >
                <span>
                  {(s.end - s.start) * dayWidth >= 38
                    ? s.phase
                    : s.phase.slice(0, s.phase === 'Deploy' ? 2 : 1)}
                </span>
              </button>
              {editable &&
                handle(
                  { ...gesture, mode: 'start' },
                  `${s.phase} 开始：拖动调整，方向键半天`,
                  'start'
                )}
              {editable &&
                handle({ ...gesture, mode: 'end' }, `${s.phase} 结束：拖动调整，方向键半天`, 'end')}
            </div>
          )
        })}
        {ghost && (
          <span className="ml-baseline-caption" style={{ left: x(delivery.stages[0].start) }}>
            原计划
          </span>
        )}
      </div>
    )
  }
  return (
    <>
      <div className="ml-sdlc-toolbar">
        <div className="ml-stage-legend" aria-label="SDLC 阶段图例">
          {phases.map((phase) => (
            <span key={phase}>
              <i className={`phase-${phase.toLowerCase()}`} />
              {phase}
            </span>
          ))}
        </div>
        <label className="ml-show-plan">
          <input
            type="checkbox"
            checked={showPlan}
            onChange={(e) => setShowPlan(e.target.checked)}
          />
          显示计划
        </label>
        <details className="ml-calendar-info">
          <summary title={calendarStatus}>工作日历</summary>
          <p>
            原型注释: {calendarStatus}
            。班、休由预置数据决定；本稿不含真实华为样本，也不提供导入入口。
          </p>
        </details>
      </div>
      <div
        className="ml-timeline-scroll"
        ref={scroll}
        tabIndex={0}
        aria-label="SDLC 特性排期，每格一天"
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
          if (e.button !== 0 || e.target.closest('button,input,a,label,summary')) {
            return
          }
          pan.current = { x: e.clientX, left: scroll.current.scrollLeft }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
      >
        <div className="ml-timeline-canvas" style={{ width: totalWidth + labelWidth }}>
          <div
            className="ml-days-background"
            style={{ left: labelWidth, width: totalWidth, top: versionHeight + 40 }}
            aria-hidden="true"
          >
            {days.map((d) => (
              <i
                key={d}
                className={isRest(d, effectiveCalendar(d)) ? 'rest' : ''}
                style={{ left: x(d), width: dayWidth }}
              />
            ))}
          </div>
          <div className="ml-board-header">
            <div className="ml-version-row" style={{ height: versionHeight }}>
              <div className="ml-sticky-label">
                特性 / 负责人<small>版本 · 日排期</small>
              </div>
              <div className="ml-version-track" style={{ width: totalWidth }}>
                {blankWeeks.map((w) => (
                  <div
                    className="ml-week-slot"
                    key={w.id}
                    style={{ left: x(day(w.start)), width: 5 * dayWidth }}
                  >
                    {planning ? (
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
                  const editable = planning && !v.started
                  const gesture = { kind: 'version', id: v.id, mode: 'move' }
                  const active = v.start <= currentDay && v.end >= currentDay
                  return (
                    <div
                      className={`ml-fixed-version ${active ? 'current' : ''}`}
                      key={v.id}
                      style={{
                        left: x(day(v.start)),
                        top: versionLanes.get(v.id) * 64,
                        width: (day(v.end) - day(v.start) + 1) * dayWidth
                      }}
                    >
                      {active && <span className="ml-current-version">当前</span>}
                      {editable ? (
                        <InlineField
                          value={v.name}
                          label={`版本名称 ${v.name}`}
                          change={(name) => onRenameVersion(v.id, name)}
                          className="ml-version-name"
                        />
                      ) : (
                        <button
                          title={v.started ? '版本已开始；原计划保留' : '进入版本总览'}
                          onClick={() => onVersion(v.id)}
                        >
                          {v.name}
                        </button>
                      )}
                      <button
                        className={`ml-version-dates ${editable ? 'editable' : ''}`}
                        title={
                          editable
                            ? '拖动平移版本；两侧调整起止日期，按天吸附'
                            : '版本已开始，日期只读'
                        }
                        onPointerDown={editable ? (e) => beginDrag(e, gesture) : undefined}
                        onKeyDown={editable ? (e) => keyboardAdjust(e, gesture) : undefined}
                      >
                        {short(v.start)}—{short(v.end)}
                        {v.started && <span> · 已开始</span>}
                      </button>
                      {editable &&
                        handle(
                          { ...gesture, mode: 'start' },
                          `${v.name} 开始：拖动或方向键调整一天`,
                          'start'
                        )}
                      {editable &&
                        handle(
                          { ...gesture, mode: 'end' },
                          `${v.name} 结束：拖动或方向键调整一天`,
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
                <small>每格一天 · 规划按半天调整</small>
              </div>
              <div className="ml-day-track" style={{ width: totalWidth }}>
                {days.map((d) => {
                  const date = dateOf(d),
                    cal = effectiveCalendar(d),
                    badge = cal?.workDays.includes(date)
                      ? '班'
                      : cal?.restDays.includes(date)
                        ? '休'
                        : ''
                  return (
                    <div
                      key={d}
                      className={`ml-day-cell ${isRest(d, cal) ? 'rest' : ''} ${date === currentDay ? 'today' : ''}`}
                      style={{ width: dayWidth }}
                      title={`${date} · ${badge || (isRest(d, cal) ? '休息日' : '工作日')}`}
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
              className={`ml-timeline-row ${showPlan && feature.deliveries.some((d) => versionById.get(d.versionId).started) ? 'with-baseline' : ''} ${dropRow?.id === feature.id ? `ml-row-drop-${dropRow.side}` : ''}`}
              onDragOver={(e) => {
                if (!ordering.current || !planning) {
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
                  {planning && (
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
                  {planning ? (
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
                <div className="ml-inline-owner">
                  {planning ? (
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
              <div className="ml-track" style={{ width: totalWidth }}>
                <svg className="ml-sdlc-connection" aria-hidden="true">
                  {feature.deliveries.slice(1).map((d, i) => {
                    const previous = feature.deliveries[i]
                    const left = x(previous.stages.at(-1).end)
                    const right = x(d.stages[0].start)
                    return right > left ? (
                      <path key={d.stages[0].phase} d={`M ${left} 45 H ${right}`} />
                    ) : null
                  })}
                </svg>
                {feature.deliveries.map((delivery, i) => {
                  const v = versionById.get(delivery.versionId),
                    first = delivery.stages[0],
                    actual = delivery.actual || []
                  const started = Boolean(v.started)
                  const anchor =
                    started && actual.length ? actualDay(actual[0].startAt) : first.start
                  return (
                    <React.Fragment key={delivery.stages[0].phase}>
                      <button
                        className="ml-delivery-caption"
                        style={{ left: x(anchor) }}
                        onClick={() => onVersion(v.id, feature)}
                      >
                        {v.name}
                        <span>{started ? '实际' : '计划'}</span>
                        <ExternalLink size={10} />
                      </button>
                      {started ? (
                        <>
                          {!actual.length && (
                            <span className="ml-actual-unknown" style={{ left: x(first.start) }}>
                              实际阶段未知
                            </span>
                          )}
                          {actual.map((s) => {
                            const left = x(actualDay(s.startAt)),
                              width = Math.max(
                                1,
                                (actualDay(s.endAt || actualAsOf) - actualDay(s.startAt)) * dayWidth
                              )
                            return (
                              <button
                                key={s.phase}
                                className={`ml-actual-phase ${!s.endAt ? 'ongoing' : ''}`}
                                style={{ left, width: Math.max(width, 12) }}
                                aria-label={`${s.phase} 实际记录`}
                                title={`原型注释: 示例记录，非真实 PR。${s.phase} · ${actualTime(s.startAt)} → ${actualTime(s.endAt)}（北京时间）\n${s.source}${!s.endAt ? '\n进行中，截至 11/11 15:30；右端不是完成时间' : ''}`}
                                onClick={() => onVersion(v.id, feature)}
                              >
                                <i className={`phase-${s.phase.toLowerCase()}`} style={{ width }} />
                                {width > 30 && (
                                  <span>
                                    {s.phase}
                                    {!s.endAt && ' · 进行中'}
                                  </span>
                                )}
                              </button>
                            )
                          })}
                          {actual.some((s) => s.phase === 'Test' && s.endAt) && (
                            <span
                              className="ml-deploy-unknown"
                              style={{
                                left: x(actualDay(actual.find((s) => s.phase === 'Test').endAt)) + 7
                              }}
                            >
                              Deploy · 未跟踪
                            </span>
                          )}
                          {showPlan && plannedBar(feature, delivery, i, true)}
                        </>
                      ) : (
                        plannedBar(feature, delivery, i)
                      )}
                    </React.Fragment>
                  )
                })}
              </div>
              {planning && (
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
                添加特性后，直接拖动阶段安排时间
              </div>
            </div>
          )}
          {planning && (
            <div className="ml-add-feature">
              <button className="btn btn-ghost" onClick={() => onAdd(calendarData)}>
                <Plus size={14} />
                添加特性
              </button>
            </div>
          )}
          <div
            className="ml-now-line"
            style={{ left: labelWidth + x(actualDay(actualAsOf)), top: versionHeight + 40 }}
            aria-hidden="true"
          />
        </div>
      </div>
    </>
  )
}
