import {
  calendarFor,
  latestMonth,
  planWeek,
  dayMs,
  dayWidth,
  labelWidth,
  at,
  iso
} from './milestones-calendar.js'
import { IconAction } from '../../version-workspace/prototype/g2-icon-action.jsx'
import {
  clone,
  loadCases,
  freshCases,
  storageKey,
  moveDelivery,
  changesBetween,
  incomplete,
  currentDay
} from './milestones-data.js'
import { historicalRows, historyPlans, historyCounts, sourceUrl } from './milestones-history.js'
import { Sidebar, ProjectContext, Scoreboard } from './milestones-shell.jsx'
import {
  Modal,
  CalendarPanel,
  ReferencePanel,
  PlanningReviewPanel,
  VersionBridge,
  HistoryVersion
} from './milestones-panels.jsx'
const {
  // eslint-disable-next-line no-unused-vars
  React,
  useState,
  useEffect,
  useRef,
  createRoot,
  BookOpen,
  CalendarRange,
  Plus,
  RefreshCw,
  ExternalLink,
  X
} = window.BWPrototypeDependencies
const shortDate = (date) => date.slice(5).replace('-', '/')
function InlineField({ value, label, placeholder, change, autoFocus = false, className = '' }) {
  const started = useRef(value)
  return (
    <input
      className={`ml-inline ${className}`}
      aria-label={label}
      placeholder={placeholder}
      value={value}
      autoFocus={autoFocus}
      aria-invalid={!value.trim()}
      onFocus={() => {
        started.current = value
      }}
      onInput={(e) => change(e.currentTarget.value)}
      onBlur={(e) => change(e.currentTarget.value.trim())}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) {
          return
        }
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        }
        if (e.key === 'Escape') {
          e.stopPropagation()
          e.currentTarget.blur()
          change(started.current)
        }
      }}
    />
  )
}
function WeekName({ week, commit }) {
  const [value, setValue] = useState('')
  const cancelled = useRef(false)
  return (
    <input
      className="ml-inline ml-week-name"
      aria-label={`版本名称 ${week.start}`}
      placeholder="版本名（自动）"
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
        if (e.nativeEvent.isComposing) {
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
function MilestoneAxis({ plan, calendar, planning, changeMilestone, navigate }) {
  const x = (value) => ((value - calendar.start) / dayMs) * dayWidth
  return (
    <div className="ml-stage-row">
      <div className="ml-sticky-label">阶段成果</div>
      <div
        className="ml-stage-track"
        style={{ width: ((calendar.end - calendar.start + dayMs) / dayMs) * dayWidth }}
      >
        {calendar.months.map((m) => {
          const left = Math.max(0, x(m.start)),
            right = x(Math.min(m.end, calendar.end) + dayMs),
            span = right - left
          if (span < 210) {
            return null
          }
          const outcome = plan.months.find((item) => item.month === m.month)?.outcome || ''
          const last = plan.versions
            .filter((v) => v.start.slice(0, 7) <= m.month && v.end.slice(0, 7) >= m.month)
            .toSorted((a, b) => a.end.localeCompare(b.end))
            .at(-1)
          const point = last ? x(Math.min(at(last.end), m.end) + dayMs / 2) - left : span - 12
          const anchor = Math.max(0, Math.min(span - 1, point))
          const captionLeft = Math.max(4 - anchor, Math.min(-100, span - anchor - 204))
          return (
            <div key={m.month} className="ml-stage-month" style={{ left, width: span }}>
              <button className="ml-month-title" onClick={() => navigate(iso(m.start))}>
                {m.month.replace('-', ' 年 ')} 月
              </button>
              {(planning || outcome) && (
                <div className="ml-stage-anchor" style={{ left: anchor }}>
                  <i className="ml-flag" />
                  <div
                    className="ml-stage-caption"
                    title={outcome}
                    style={{ left: captionLeft, '--tip-left': `${-captionLeft - 3}px` }}
                  >
                    {planning ? (
                      <InlineField
                        value={outcome}
                        label={`${m.month} 阶段成果`}
                        placeholder="一句阶段成果"
                        change={(value) => changeMilestone(m.month, value)}
                      />
                    ) : (
                      <span>{outcome}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
function Timeline({
  rows,
  plan,
  planning,
  navigation,
  onChangeFeature,
  onRenameVersion,
  onDelete,
  onMove,
  onVersion,
  onReorder,
  newFeature,
  onAdd,
  onNameWeek,
  changeMilestone
}) {
  const calendar = calendarFor(plan),
    axisStart = calendar.start,
    axisEnd = calendar.end
  const totalDays = (axisEnd - axisStart + dayMs) / dayMs
  const xFor = (date) => ((at(date) - axisStart) / dayMs) * dayWidth
  const centerFor = (v) => (xFor(v.start) + xFor(v.end) + dayWidth) / 2
  const trackWidth = totalDays * dayWidth
  const scroll = useRef(null),
    lastViewport = useRef(null),
    pan = useRef(null),
    pointer = useRef(null),
    suppress = useRef(false),
    ordering = useRef(null)
  const [drag, setDrag] = useState(null),
    [rowDrop, setRowDrop] = useState(null)
  const navigationLeft = Math.max(0, xFor(navigation.date) - 16)
  useEffect(() => {
    const previous = lastViewport.current
    if (!previous || previous.navigation !== navigation) {
      scroll.current?.scrollTo({ left: navigationLeft, top: 0, behavior: 'smooth' })
    } else if (scroll.current && previous.start !== axisStart) {
      scroll.current.scrollLeft += ((previous.start - axisStart) / dayMs) * dayWidth
    }
    lastViewport.current = { navigation, start: axisStart }
  }, [navigation, navigationLeft, axisStart])
  const versions = plan.versions.filter((v) => v.start && v.end)
  const emptyWeeks = calendar.weeks.filter(
    (w) => !versions.some((v) => v.start <= w.end && v.end >= w.start)
  )
  const targets = [...versions, ...emptyWeeks].sort((a, b) => a.start.localeCompare(b.start))
  const byId = Object.fromEntries(targets.map((v) => [v.id, v]))
  const down = (e, item, kind) => {
    suppress.current = false
    if (!planning || e.button !== 0) {
      return
    }
    e.currentTarget.focus()
    e.currentTarget.setPointerCapture(e.pointerId)
    pointer.current = { x: e.clientX, id: item.id, kind, target: item[kind], moved: false }
  }
  const move = (e) => {
    const p = pointer.current
    if (!p) {
      return
    }
    if (Math.abs(e.clientX - p.x) > 5) {
      p.moved = true
    }
    if (!p.moved) {
      return
    }
    const r = scroll.current.getBoundingClientRect()
    if (e.clientX > r.right - 30) {
      scroll.current.scrollLeft += 12
    }
    if (e.clientX < r.left + labelWidth + 30) {
      scroll.current.scrollLeft -= 12
    }
    const x = e.clientX - r.left + scroll.current.scrollLeft - labelWidth
    p.target = targets.reduce((a, b) =>
      Math.abs(centerFor(a) - x) < Math.abs(centerFor(b) - x) ? a : b
    ).id
    setDrag({ ...p })
  }
  const up = () => {
    const p = pointer.current
    if (!p) {
      return
    }
    pointer.current = null
    setDrag(null)
    suppress.current = p.moved
    if (p.moved) {
      onMove(p.id, p.kind, p.target)
    }
  }
  const cancel = () => {
    pointer.current = null
    setDrag(null)
    suppress.current = false
  }
  return (
    <div
      className="ml-timeline-scroll"
      ref={scroll}
      role="region"
      aria-label="特性泳道"
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0 || e.target.closest('button,a,input,label')) {
          return
        }
        pan.current = { x: e.clientX, left: scroll.current.scrollLeft }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (pan.current) {
          scroll.current.scrollLeft = pan.current.left + pan.current.x - e.clientX
        }
      }}
      onPointerUp={() => {
        pan.current = null
      }}
      onPointerCancel={() => {
        pan.current = null
      }}
    >
      <div className="ml-timeline-canvas" style={{ width: labelWidth + trackWidth }}>
        <MilestoneAxis
          plan={plan}
          calendar={calendar}
          planning={planning}
          changeMilestone={changeMilestone}
          navigate={(date) =>
            scroll.current?.scrollTo({ left: Math.max(0, xFor(date)), behavior: 'smooth' })
          }
        />
        <div className="ml-date-row">
          <div className="ml-sticky-label">特性 / 负责人</div>
          <div className="ml-date-track">
            {Array.from({ length: Math.ceil(totalDays / 7) }, (_, i) => (
              <span key={i} style={{ left: i * 7 * dayWidth }}>
                {shortDate(new Date(axisStart + i * 7 * dayMs).toISOString().slice(0, 10))}
              </span>
            ))}
          </div>
        </div>
        <div className="ml-version-row">
          <div className="ml-sticky-label">周版本</div>
          <div className="ml-version-track">
            {emptyWeeks.map((w) => (
              <div
                key={w.id}
                className="ml-week-slot"
                style={{ left: xFor(w.start), width: 5 * dayWidth }}
              >
                {planning ? (
                  <WeekName week={w} commit={(name) => onNameWeek(w, name)} />
                ) : (
                  <span>周窗口</span>
                )}
                <small>
                  {shortDate(w.start)}—{shortDate(w.end)}
                </small>
              </div>
            ))}
            {versions.map((v) => (
              <div
                key={v.id}
                className={`ml-fixed-version ${currentDay >= v.start && currentDay <= v.end ? 'current' : ''}`}
                style={{ left: xFor(v.start), width: xFor(v.end) - xFor(v.start) + dayWidth }}
              >
                {planning ? (
                  <InlineField
                    value={v.name}
                    label={`版本名称 ${v.id}`}
                    change={(name) => onRenameVersion(v.id, name)}
                  />
                ) : (
                  <button onClick={() => onVersion(v.id)}>{v.name}</button>
                )}
                <small>
                  {shortDate(v.start)}—{shortDate(v.end)}
                </small>
              </div>
            ))}
          </div>
        </div>
        {rows.map((item, index) => (
          <div
            key={item.id}
            className={`ml-timeline-row ${rowDrop?.id === item.id ? `ml-row-drop-${rowDrop.side}` : ''}`}
            data-feature-id={item.id}
            onDragOver={(e) => {
              if (!ordering.current) {
                return
              }
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              const r = e.currentTarget.getBoundingClientRect()
              setRowDrop({
                id: item.id,
                side: e.clientY > r.top + r.height / 2 ? 'after' : 'before'
              })
              const viewport = scroll.current.getBoundingClientRect()
              if (e.clientY > viewport.bottom - 30) {
                scroll.current.scrollTop += 10
              }
              if (e.clientY < viewport.top + 100) {
                scroll.current.scrollTop -= 10
              }
            }}
            onDrop={(e) => {
              if (!ordering.current) {
                return
              }
              e.preventDefault()
              const r = e.currentTarget.getBoundingClientRect()
              onReorder(
                ordering.current,
                item.id,
                e.clientY > r.top + r.height / 2 ? 'after' : 'before'
              )
              ordering.current = null
              setRowDrop(null)
            }}
          >
            <div className="ml-sticky-label">
              {planning ? (
                <>
                  <div className="ml-feature-heading">
                    <button
                      className="ml-order-handle"
                      draggable
                      aria-label={`排序 ${item.title || '新特性'}`}
                      title="拖动排序；Alt+上下键移动"
                      onDragStart={(e) => {
                        ordering.current = item.id
                        e.dataTransfer.setData('text/plain', item.id)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragEnd={() => {
                        ordering.current = null
                        setRowDrop(null)
                      }}
                      onKeyDown={(e) => {
                        if (!e.altKey || !['ArrowUp', 'ArrowDown'].includes(e.key)) {
                          return
                        }
                        e.preventDefault()
                        const next = index + (e.key === 'ArrowUp' ? -1 : 1)
                        if (rows[next]) {
                          onReorder(item.id, rows[next].id, next < index ? 'before' : 'after')
                        }
                      }}
                    >
                      ⠿
                    </button>
                    <InlineField
                      className="ml-feature-name"
                      value={item.title}
                      label={`特性名称 ${item.id}`}
                      placeholder="特性名称"
                      autoFocus={item.id === newFeature}
                      change={(title) => onChangeFeature(item.id, { title })}
                    />
                  </div>
                  <div className="ml-inline-owner">
                    <InlineField
                      value={item.owner}
                      label={`负责人 ${item.title || '新特性'}`}
                      placeholder="负责人"
                      change={(owner) => onChangeFeature(item.id, { owner })}
                    />
                    <IconAction
                      label={`移除特性 ${item.title || '新特性'}`}
                      icon={X}
                      onClick={() => onDelete(item)}
                    />
                  </div>
                </>
              ) : (
                <>
                  <strong>{item.title}</strong>
                  <small>{item.owner}</small>
                </>
              )}
            </div>
            <div className="ml-track" style={{ width: totalDays * dayWidth }}>
              {drag?.id === item.id && (
                <div
                  className="ml-drop-target"
                  style={{
                    left: xFor(byId[drag.target].start),
                    width: xFor(byId[drag.target].end) - xFor(byId[drag.target].start) + dayWidth
                  }}
                />
              )}
              {['pre', 'release'].map((kind, i) => {
                const target =
                    drag?.id === item.id && drag.kind === kind ? drag.target : item[kind],
                  v = byId[target]
                if (!v) {
                  return null
                }
                return (
                  <button
                    key={kind}
                    className={`ml-delivery-node ${kind} ${planning ? 'editable' : ''} ${drag?.id === item.id && drag.kind === kind ? 'dragging' : ''}`}
                    style={{ left: centerFor(v) - 65, top: 8 + i * 48 }}
                    aria-label={`${item.title || '新特性'} · ${kind === 'pre' ? 'Pre版本' : 'Release版本'} · ${v.name || '周窗口'}`}
                    title={planning ? '拖动安排；Shift+左右键移动；点击进入版本' : '进入版本总览'}
                    onPointerDown={(e) => down(e, item, kind)}
                    onPointerMove={move}
                    onPointerUp={up}
                    onPointerCancel={cancel}
                    onClick={(e) => {
                      if (suppress.current) {
                        suppress.current = false
                        e.preventDefault()
                        return
                      }
                      onVersion(item[kind], item)
                    }}
                    onKeyDown={(e) => {
                      if (
                        !planning ||
                        !e.shiftKey ||
                        !['ArrowLeft', 'ArrowRight'].includes(e.key)
                      ) {
                        return
                      }
                      e.preventDefault()
                      const n =
                        targets.findIndex((entry) => entry.id === item[kind]) +
                        (e.key === 'ArrowLeft' ? -1 : 1)
                      if (targets[n]) {
                        onMove(item.id, kind, targets[n].id)
                      }
                    }}
                  >
                    <span>
                      <i />
                      {kind === 'pre' ? 'Pre版本' : 'Release版本'}
                      <ExternalLink size={12} />
                    </span>
                    <small>{v.name || '周窗口'}</small>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {!rows.length && (
          <div className="ml-empty-lanes">
            <div className="ml-sticky-label">还没有特性</div>
            <div className="ml-empty-grid" style={{ width: trackWidth }}>
              <span>添加特性后，直接拖动 Pre / Release 到周窗口。</span>
            </div>
          </div>
        )}
        {planning && (
          <div className="ml-add-feature">
            <button className="btn btn-ghost" onClick={onAdd}>
              <Plus size={13} />
              添加特性
            </button>
          </div>
        )}
        {Date.parse(`${currentDay}T00:00:00Z`) >= axisStart &&
          Date.parse(`${currentDay}T00:00:00Z`) <= axisEnd && (
            <div className="ml-now-line" style={{ left: labelWidth + xFor(currentDay) }} />
          )}
      </div>
    </div>
  )
}
function App() {
  const [cases, setCases] = useState(loadCases),
    [caseId, setCaseId] = useState('existing'),
    [planning, setPlanning] = useState(false)
  const [navigation, setNavigation] = useState(() => ({
      date: `${latestMonth(cases.existing.published || cases.existing.draft)}-01`,
      sequence: 0
    })),
    [modal, setModal] = useState(null),
    [theme, setTheme] = useState('light'),
    [notice, setNotice] = useState(''),
    [saveError, setSaveError] = useState(''),
    [removed, setRemoved] = useState(null),
    [newFeature, setNewFeature] = useState(null)
  const board = useRef(null),
    state = cases[caseId],
    dirty = JSON.stringify(state.draft) !== JSON.stringify(state.submitted),
    current = planning ? state.draft : state.published,
    empty = !planning && !state.published
  const histories = useRef({
    existing: { past: [], future: [], field: null },
    empty: { past: [], future: [], field: null }
  })
  const history = histories.current[caseId]
  const plan = current || state.draft,
    changes = changesBetween(state.submitted, state.draft),
    problem = incomplete(state.draft)
  const setState = (updater) => setCases((all) => ({ ...all, [caseId]: updater(all[caseId]) }))
  const editPlan = (updater, fieldEdit = false) => {
    const draft = updater(state.draft)
    if (JSON.stringify(draft) === JSON.stringify(state.draft)) {
      return
    }
    const field = fieldEdit
      ? document.activeElement?.matches('input.ml-inline')
        ? document.activeElement
        : history.field
      : null
    if (!field || history.field !== field) {
      history.past = [...history.past.slice(-99), clone(state.draft)]
    }
    if (JSON.stringify(history.past.at(-1)) === JSON.stringify(draft)) {
      history.past.pop()
    }
    history.field = field
    history.future = []
    setState((s) => ({ ...s, draft }))
  }
  const editFieldPlan = (updater) => editPlan(updater, true)
  const stepHistory = (redo = false) => {
    const list = redo ? history.future : history.past
    const draft = list.pop()
    if (!draft) {
      return
    }
    ;(redo ? history.past : history.future).push(clone(state.draft))
    history.field = null
    setRemoved(null)
    setState((s) => ({ ...s, draft }))
  }
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(cases))
      setSaveError('')
    } catch {
      setSaveError('浏览器无法保存规划，刷新后修改可能丢失。')
    }
  }, [cases])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  useEffect(() => {
    if (!notice) {
      return
    }
    const id = setTimeout(() => setNotice(''), 4500)
    return () => clearTimeout(id)
  }, [notice])
  const navigate = (date) => {
    setNavigation((n) => ({ date, sequence: n.sequence + 1 }))
  }
  const choose = (value) => {
    const selected = value === 'empty' ? cases.empty : cases.existing
    setCaseId(value === 'empty' ? 'empty' : 'existing')
    setPlanning(value === 'planning')
    navigate(
      `${latestMonth(value === 'planning' ? selected.draft : selected.published || selected.draft)}-01`
    )
    setModal(null)
    setRemoved(null)
  }
  const begin = () => {
    setPlanning(true)
    navigate(`${latestMonth(state.draft)}-01`)
    requestAnimationFrame(() =>
      board.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    )
  }
  const changeFeature = (id, patch) =>
    editFieldPlan((p) => ({
      ...p,
      features: p.features.map((f) => (f.id === id ? { ...f, ...patch } : f))
    }))
  const move = (id, kind, target) => {
    const week = calendarFor(state.draft).weeks.find((w) => w.id === target)
    const used = week ? planWeek(state.draft, week) : null
    const result = moveDelivery(used?.plan || state.draft, id, kind, used?.version.id || target)
    if (result.error) {
      setNotice(result.error)
      return
    }
    editPlan(() => result.plan)
  }
  const remove = (item) => {
    setRemoved({ item, index: state.draft.features.findIndex((f) => f.id === item.id) })
    editPlan((p) => ({ ...p, features: p.features.filter((f) => f.id !== item.id) }))
  }
  const undoRemove = () => {
    if (!removed) {
      return
    }
    editPlan((p) => {
      const features = [...p.features]
      if (!features.some((f) => f.id === removed.item.id)) {
        features.splice(Math.min(removed.index, features.length), 0, removed.item)
      }
      return { ...p, features }
    })
    setRemoved(null)
  }
  const add = () => {
    const id = `demo-${crypto.randomUUID()}`
    const calendar = calendarFor(state.draft)
    const focus = latestMonth(state.draft)
    const day = focus === currentDay.slice(0, 7) ? currentDay : `${focus}-01`
    const week =
      calendar.weeks.find((w) => w.start <= day && iso(at(w.start) + 6 * dayMs) >= day) ||
      calendar.weeks.at(-3)
    const next = planWeek(state.draft, week)
    setNewFeature(id)
    editPlan(() => ({
      ...next.plan,
      features: [
        ...next.plan.features,
        {
          id,
          month: week.start.slice(0, 7),
          title: '',
          owner: '',
          pre: next.version.id,
          release: next.version.id
        }
      ]
    }))
  }
  const reorder = (id, target, side) => {
    if (id === target) {
      return
    }
    editPlan((p) => {
      const item = p.features.find((f) => f.id === id)
      const features = p.features.filter((f) => f.id !== id)
      const index = features.findIndex((f) => f.id === target)
      if (!item || index === -1) {
        return p
      }
      features.splice(index + (side === 'after' ? 1 : 0), 0, item)
      return { ...p, features }
    })
  }
  const restore = () => {
    setState((s) => ({ ...s, draft: clone(s.submitted) }))
    setRemoved(null)
    setNotice('已还原最近提交后的修改')
  }
  const submit = () => {
    if (!dirty || problem || state.review === 'merged') {
      return
    }
    setState((s) => ({ ...s, submitted: clone(s.draft), review: 'open' }))
    history.past = []
    history.future = []
    history.field = null
    setRemoved(null)
  }
  const publish = () => {
    if (state.review !== 'merged') {
      return
    }
    setState((s) => ({ ...s, published: clone(s.submitted), review: 'none' }))
    setPlanning(dirty)
    setModal(null)
    setRemoved(null)
    setNotice(dirty ? '正式安排已更新，未提交修改仍保留' : '正式安排已更新')
  }
  const openVersion = (version, item) => {
    const history = historyPlans.find((p) => p.version === version)
    setModal(
      history ? { type: 'history-version', plan: history } : { type: 'version', version, item }
    )
  }
  const info = (title, text) => setModal({ type: 'info', title, text })
  const changeMilestone = (month, outcome) =>
    editFieldPlan((p) => ({
      ...p,
      months: p.months.some((m) => m.month === month)
        ? p.months.map((m) => (m.month === month ? { ...m, outcome } : m))
        : [...p.months, { month, outcome }]
    }))
  const nameWeek = (week, name) => {
    if (state.draft.versions.some((v) => v.name === name)) {
      setNotice('版本名称已存在')
      return
    }
    editPlan((p) => planWeek(p, week, name).plan)
  }
  const status = dirty
    ? '编辑中'
    : state.review === 'open'
      ? '已提交，待合入'
      : state.review === 'merged'
        ? '已合入，待更新'
        : '编辑中'
  return (
    <>
      <div className="ml-review-strip">
        <span>
          原型注释: 模拟
          11/11；浅色周块是周一至周五的时间背景，拖入特性或改名才登记版本；未对接华为日历，非 v0.8
          承诺。
        </span>
        <div className="ml-actions">
          <IconAction
            label="重置原型"
            icon={RefreshCw}
            onClick={() => setModal({ type: 'reset' })}
          />
          <button
            className="btn btn-ghost"
            aria-label="切换主题"
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          >
            ◐
          </button>
        </div>
      </div>
      <div
        className="ml-app"
        onFocusCapture={(event) => {
          if (event.target.matches('input.ml-inline')) {
            history.field = null
          }
        }}
        onKeyDown={(event) => {
          if (
            !planning ||
            event.target.closest('input, textarea, [contenteditable="true"]') ||
            !(event.ctrlKey || event.metaKey) ||
            !['z', 'y'].includes(event.key.toLowerCase())
          ) {
            return
          }
          event.preventDefault()
          stepHistory(event.key.toLowerCase() === 'y' || event.shiftKey)
        }}
      >
        <Sidebar
          empty={empty}
          versions={plan.versions}
          onInfo={info}
          onVersion={openVersion}
          onHome={() => document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })}
        />
        <div className="ml-workspace">
          <header className="ml-topbar">
            <span>
              Builders’ Workbench <span>›</span>项目总览
            </span>
            <div className="ml-actions">
              <label className="ml-scene-label">
                原型场景
                <select
                  className="input"
                  aria-label="原型场景"
                  value={
                    planning
                      ? 'planning'
                      : caseId === 'empty' && !state.published
                        ? 'empty'
                        : 'ready'
                  }
                  onChange={(e) => choose(e.target.value)}
                >
                  <option value="empty">尚无里程碑</option>
                  <option value="planning">制定中</option>
                  <option value="ready">已制定</option>
                </select>
              </label>
              <IconAction
                label="设计依据"
                icon={BookOpen}
                onClick={() => setModal({ type: 'references' })}
              />
            </div>
          </header>
          <main className="ml-main">
            <div className="ml-page-head">
              <h1>项目总览</h1>
              <button
                className="btn btn-secondary"
                onClick={() =>
                  state.review === 'merged'
                    ? publish()
                    : setNotice('原型注释: 当前未连接真实主干更新。')
                }
              >
                更新代码
              </button>
            </div>
            <ProjectContext />
            <section className="ml-milestone-block" aria-label="项目里程碑" ref={board}>
              <div className="ml-milestone-heading">
                <h2>项目里程碑</h2>
                <div className="ml-actions">
                  <IconAction
                    label="工作日历"
                    icon={CalendarRange}
                    onClick={(e) =>
                      setModal({
                        type: 'calendar',
                        anchor: e.currentTarget.getBoundingClientRect()
                      })
                    }
                  />
                  {planning ? (
                    <>
                      <span className={`tag tag-outline ${dirty ? 'ml-dirty' : ''}`}>{status}</span>
                      <button
                        className="btn btn-ghost ml-history-button"
                        aria-label="撤销"
                        title="撤销 · Ctrl+Z"
                        disabled={!history.past.length}
                        onClick={() => stepHistory()}
                      >
                        ↶
                      </button>
                      <button
                        className="btn btn-ghost ml-history-button"
                        aria-label="重做"
                        title="重做 · Ctrl+Shift+Z"
                        disabled={!history.future.length}
                        onClick={() => stepHistory(true)}
                      >
                        ↷
                      </button>
                      <details className="ml-more-actions">
                        <summary aria-label="更多规划操作">⋯</summary>
                        <div>
                          <button
                            className="btn btn-ghost"
                            disabled={!dirty}
                            onClick={(e) => {
                              restore()
                              history.past = []
                              history.future = []
                              e.currentTarget.closest('details').open = false
                            }}
                          >
                            放弃本次修改
                          </button>
                        </div>
                      </details>
                      {state.review === 'merged' ? (
                        <button
                          className="btn btn-primary"
                          onClick={() => setModal({ type: 'review' })}
                        >
                          更新正式安排
                        </button>
                      ) : (
                        <button
                          className="btn btn-primary"
                          disabled={dirty ? Boolean(problem) : state.review === 'none'}
                          title={
                            dirty
                              ? problem || '核对本次变更'
                              : state.review === 'none'
                                ? '没有未提交修改'
                                : '查看已提交的评审'
                          }
                          onClick={() => setModal({ type: 'review' })}
                        >
                          {dirty
                            ? state.review === 'open'
                              ? '更新评审'
                              : '提交评审'
                            : state.review === 'open'
                              ? '查看评审'
                              : '提交评审'}
                        </button>
                      )}
                    </>
                  ) : (
                    <button className="btn btn-primary" onClick={begin}>
                      规划里程碑
                      {dirty
                        ? ' · 有修改'
                        : state.review === 'open'
                          ? ' · 待合入'
                          : state.review === 'merged'
                            ? ' · 待更新'
                            : ''}
                    </button>
                  )}
                </div>
              </div>
              {empty ? (
                <div className="ml-first-plan">
                  <CalendarRange size={30} />
                  <h3>还没有里程碑</h3>
                </div>
              ) : (
                <>
                  <div className="ml-support-head">
                    <span>{plan.features.length} 个特性</span>
                    <button
                      className="btn btn-ghost"
                      onClick={() => navigate(`${latestMonth(plan)}-01`)}
                    >
                      定位最新
                    </button>
                  </div>
                  <Timeline
                    rows={plan.features}
                    plan={plan}
                    onAdd={add}
                    onNameWeek={nameWeek}
                    changeMilestone={changeMilestone}
                    planning={planning}
                    navigation={navigation}
                    onChangeFeature={changeFeature}
                    onRenameVersion={(id, name) =>
                      editFieldPlan((p) => ({
                        ...p,
                        versions: p.versions.map((v) => (v.id === id ? { ...v, name } : v))
                      }))
                    }
                    onDelete={remove}
                    onReorder={reorder}
                    onMove={move}
                    onVersion={openVersion}
                    newFeature={newFeature}
                  />
                  <div className="ml-material-origin">
                    <span>{planning ? '规划编辑中' : '正式安排'}</span>
                    <button className="btn btn-ghost" onClick={() => setModal({ type: 'sources' })}>
                      查看来源
                    </button>
                  </div>
                </>
              )}
            </section>
            <Scoreboard theme={theme} />
          </main>
        </div>
      </div>
      {modal?.type === 'calendar' && (
        <CalendarPanel anchor={modal.anchor} close={() => setModal(null)} />
      )}
      {modal?.type === 'references' && <ReferencePanel close={() => setModal(null)} />}
      {modal?.type === 'version' && (
        <VersionBridge
          item={modal.item}
          version={modal.version}
          plan={plan}
          close={() => setModal(null)}
        />
      )}
      {modal?.type === 'history-version' && (
        <HistoryVersion plan={modal.plan} close={() => setModal(null)} />
      )}
      {modal?.type === 'review' && (
        <PlanningReviewPanel
          state={state}
          changes={changes}
          submit={submit}
          markMerged={() => setState((s) => ({ ...s, review: 'merged' }))}
          publish={publish}
          close={() => setModal(null)}
        />
      )}
      {modal?.type === 'sources' && (
        <Modal title="里程碑资料来源" close={() => setModal(null)} wide>
          <p>
            原型注释: 版本来源为 .bw/planning。历史材料未记录规划时间，不绘入时间轴；不使用 GitHub
            Releases 补日期。
          </p>
          <p>
            各版目标验收：{historyCounts.met} 达成 · {historyCounts.notMet} 未达 ·{' '}
            {historyCounts.unknown} 未记录。
          </p>
          <div className="ml-source-columns">
            <section>
              <h3>计划与人工验收</h3>
              {historyPlans.map((p) => (
                <p key={p.version}>
                  <a
                    href={sourceUrl(`.bw/planning/${p.version}/data.json`)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {p.version} 计划 ↗
                  </a>
                  {historicalRows.some((r) => r.planVersion === p.version && r.acceptancePath) && (
                    <>
                      {' '}
                      ·{' '}
                      <a
                        href={sourceUrl(`.bw/planning/${p.version}/acceptance.json`)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        人工验收 ↗
                      </a>
                    </>
                  )}
                </p>
              ))}
            </section>
          </div>
          <p className="ml-footnote">
            原型注释: 11
            月六个特性、人员与排期为演示；改名沿同一演示版本引用。真实身份、材料写入与跨屏协议留待开发方案对齐。
          </p>
        </Modal>
      )}
      {modal?.type === 'info' && (
        <Modal title={modal.title} close={() => setModal(null)}>
          <p>{modal.text}</p>
        </Modal>
      )}
      {modal?.type === 'reset' && (
        <Modal title="重置原型" close={() => setModal(null)}>
          <p>原型注释: 重置浏览器演示样本；原生浏览器批注保留。</p>
          <footer>
            <button
              className="btn btn-primary"
              onClick={() => {
                setCases(freshCases())
                choose('ready')
              }}
            >
              重置
            </button>
          </footer>
        </Modal>
      )}
      {removed && planning && (
        <div className="ml-undo" role="status">
          <span>已移除 {removed.item.title || '新特性'}</span>
          <button className="btn btn-ghost" onClick={undoRemove}>
            撤销
          </button>
          <IconAction label="关闭撤销提示" icon={X} onClick={() => setRemoved(null)} />
        </div>
      )}
      {notice && (
        <div className="ml-toast" role="status">
          {notice}
        </div>
      )}
      {saveError && (
        <div className="ml-save-error" role="alert">
          {saveError}
        </div>
      )}
    </>
  )
}
createRoot(document.getElementById('root')).render(<App />)
