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
const dayMs = 86400000,
  axisStart = Date.parse('2026-11-01T00:00:00Z'),
  dayWidth = 28,
  labelWidth = 230,
  totalDays = 30
const xFor = (date) =>
  ((Date.parse(date.length === 10 ? `${date}T00:00:00Z` : date) - axisStart) / dayMs) * dayWidth
const centerFor = (v) => (xFor(v.start) + xFor(v.end) + dayWidth) / 2
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
function Navigator({ plan, planning, navigate, changeMilestone }) {
  return (
    <div className="ml-navigator" aria-label="里程碑时间导航">
      <div className="ml-flag-row">
        <div className="ml-flag-item selected">
          <button aria-label="定位 11 月" onClick={() => navigate('2026-11-01')}>
            <i className="ml-flag" />
            11 月
          </button>
          <div className="ml-outcome-bubble">
            {planning ? (
              <InlineField
                value={plan.milestone}
                label="阶段成果"
                placeholder="一句话写阶段成果"
                change={changeMilestone}
              />
            ) : (
              <button className="ml-flag-title" onClick={() => navigate('2026-11-01')}>
                {plan.milestone}
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="ml-mini-axis">
        {plan.versions
          .filter((v) => v.start && v.end)
          .map((v) => (
            <button
              key={v.id}
              className={`ml-mini-version ${currentDay >= v.start && currentDay <= v.end ? 'current' : ''}`}
              style={{ left: `${(centerFor(v) / (totalDays * dayWidth)) * 100}%` }}
              aria-label={`定位 ${v.name || '未命名版本'}`}
              onClick={() => navigate(v.start)}
            >
              <i />
              {v.name || '未命名'}
              <small>
                {shortDate(v.start)}—{shortDate(v.end)}
              </small>
            </button>
          ))}
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
  newFeature
}) {
  const scroll = useRef(null),
    pan = useRef(null),
    pointer = useRef(null),
    suppress = useRef(false),
    ordering = useRef(null)
  const [drag, setDrag] = useState(null),
    [rowDrop, setRowDrop] = useState(null)
  useEffect(() => {
    scroll.current?.scrollTo({
      left: Math.max(0, xFor(navigation.date) - 16),
      top: 0,
      behavior: 'smooth'
    })
  }, [navigation])
  const versions = plan.versions.filter((v) => v.start && v.end),
    byId = Object.fromEntries(versions.map((v) => [v.id, v]))
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
    p.target = versions.reduce((a, b) =>
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
      <div className="ml-timeline-canvas" style={{ width: labelWidth + totalDays * dayWidth }}>
        <div className="ml-date-row">
          <div className="ml-sticky-label">特性 / 负责人</div>
          <div className="ml-date-track">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} style={{ left: i * 7 * dayWidth }}>
                {shortDate(new Date(axisStart + i * 7 * dayMs).toISOString().slice(0, 10))}
              </span>
            ))}
          </div>
        </div>
        <div className="ml-version-row">
          <div className="ml-sticky-label">2026 年 11 月</div>
          <div className="ml-version-track">
            {versions.map((v) => (
              <div
                key={v.id}
                className={`ml-fixed-version ${currentDay >= v.start && currentDay <= v.end ? 'current' : ''}`}
                style={{ left: xFor(v.start), width: xFor(v.end) - xFor(v.start) + dayWidth }}
              >
                {planning ? (
                  <InlineField
                    className="ml-version-name"
                    value={v.name}
                    label={`版本名称 ${shortDate(v.start)}—${shortDate(v.end)}`}
                    placeholder="版本名称"
                    change={(name) => onRenameVersion(v.id, name)}
                  />
                ) : (
                  <button onClick={() => onVersion(v.id)}>{v.name || '未命名版本'}</button>
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
                    style={{ left: centerFor(v) - 65, top: 6 + i * 36 }}
                    aria-label={`${item.title || '新特性'} · ${kind === 'pre' ? 'Pre版本' : 'Release版本'} · ${v.name || '未命名版本'}`}
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
                        versions.findIndex((entry) => entry.id === item[kind]) +
                        (e.key === 'ArrowLeft' ? -1 : 1)
                      if (versions[n]) {
                        onMove(item.id, kind, versions[n].id)
                      }
                    }}
                  >
                    <span>
                      <i />
                      {kind === 'pre' ? 'Pre版本' : 'Release版本'}
                      <ExternalLink size={12} />
                    </span>
                    <small>{v.name || '未命名版本'}</small>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {!rows.length && <div className="ml-empty-lanes">点击“添加特性”，直接在泳道安排交付。</div>}
        <div className="ml-now-line" style={{ left: labelWidth + xFor(currentDay) }} />
      </div>
    </div>
  )
}
function App() {
  const [cases, setCases] = useState(loadCases),
    [caseId, setCaseId] = useState('existing'),
    [planning, setPlanning] = useState(false)
  const [navigation, setNavigation] = useState({ date: '2026-11-01', sequence: 0 }),
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
  const plan = current || state.draft,
    changes = changesBetween(state.submitted, state.draft),
    problem = incomplete(state.draft)
  const setState = (updater) => setCases((all) => ({ ...all, [caseId]: updater(all[caseId]) }))
  const editPlan = (updater) => setState((s) => ({ ...s, draft: updater(s.draft) }))
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
    setCaseId(value === 'empty' ? 'empty' : 'existing')
    setPlanning(value === 'planning')
    navigate('2026-11-01')
    setModal(null)
    setRemoved(null)
  }
  const begin = () => {
    setPlanning(true)
    navigate('2026-11-01')
    requestAnimationFrame(() =>
      board.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    )
  }
  const changeFeature = (id, patch) =>
    editPlan((p) => ({
      ...p,
      features: p.features.map((f) => (f.id === id ? { ...f, ...patch } : f))
    }))
  const move = (id, kind, target) => {
    const result = moveDelivery(state.draft, id, kind, target)
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
    setNewFeature(id)
    editPlan((p) => ({
      ...p,
      features: [...p.features, { id, title: '', owner: '', pre: 'v1.0.1', release: 'v1.1.0' }]
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
  const status = dirty
    ? '有未提交修改'
    : state.review === 'open'
      ? '已提交，待合入'
      : state.review === 'merged'
        ? '已合入，待更新'
        : '未修改'
  return (
    <>
      <div className="ml-review-strip">
        <span>
          原型注释: 模拟时间 11/11；版本与日期为演示；历史计划无排期，未绘入时间轴，非 v0.8 承诺。
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
      <div className="ml-app">
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
                      <button className="btn btn-ghost" disabled={!dirty} onClick={restore}>
                        还原修改
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setPlanning(false)
                          setRemoved(null)
                        }}
                      >
                        查看正式安排
                      </button>
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
                  <Navigator
                    plan={plan}
                    planning={planning}
                    navigate={navigate}
                    changeMilestone={(milestone) => editPlan((p) => ({ ...p, milestone }))}
                  />
                  <div className="ml-support-head">
                    <span>
                      {`${plan.features.length} 个特性 · ${new Set(plan.features.map((f) => f.owner).filter(Boolean)).size} 位负责人`}
                    </span>
                    {planning && (
                      <button className="btn btn-secondary" onClick={add}>
                        <Plus size={13} />
                        添加特性
                      </button>
                    )}
                  </div>
                  <Timeline
                    historical={historical}
                    rows={plan.features}
                    plan={plan}
                    planning={planning}
                    navigation={navigation}
                    onChangeFeature={changeFeature}
                    onRenameVersion={(id, name) =>
                      editPlan((p) => ({
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
