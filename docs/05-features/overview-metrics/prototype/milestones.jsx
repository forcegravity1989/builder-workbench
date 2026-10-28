import { IconAction } from '../../version-workspace/prototype/g2-icon-action.jsx'
import {
  initial,
  storageKey,
  loadDraft,
  fixedVersions,
  versionById,
  versionIndex,
  moveDelivery,
  deadlineWarning,
  currentDay
} from './milestones-data.js'
import {
  historicalRows,
  historyPlans,
  historyCounts,
  releaseGroups,
  publishedReleases,
  outcomeLabel,
  sourceUrl
} from './milestones-history.js'
import { Sidebar, ProjectContext, Scoreboard } from './milestones-shell.jsx'
import {
  Modal,
  CalendarPanel,
  ReferencePanel,
  EditRequirement,
  EditMilestone,
  PlanningReviewPanel,
  VersionBridge,
  HistoryDetail,
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
  Pencil,
  Plus,
  RefreshCw,
  ExternalLink
} = window.BWPrototypeDependencies
const dayMs = 86400000,
  axisStart = Date.parse('2026-10-01T00:00:00Z'),
  dayWidth = 24,
  labelWidth = 250,
  totalDays = 61
const xFor = (date) =>
  ((Date.parse(date.length === 10 ? `${date}T00:00:00Z` : date) - axisStart) / dayMs) * dayWidth
const centerFor = (v) => (xFor(v.start) + xFor(v.end) + dayWidth) / 2

function Timeline({
  historical,
  rows,
  planning,
  onEdit,
  onVersion,
  onHistory,
  onReleases,
  onMove
}) {
  const scroll = useRef(null),
    pan = useRef(null),
    pointer = useRef(null),
    suppress = useRef(false)
  const [drag, setDrag] = useState(null)
  useEffect(() => {
    if (scroll.current) {
      scroll.current.scrollTo({ left: historical ? 0 : xFor('2026-11-01') - 16, top: 0 })
    }
  }, [historical])
  const position = (where) =>
    scroll.current?.scrollTo({
      left: where === 'history' ? 0 : xFor('2026-11-01') - 16,
      top: 0,
      behavior: 'smooth'
    })
  const down = (e, item, kind) => {
    suppress.current = false
    if (!planning || historical || !item.included || e.button !== 0) {
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
    const v = fixedVersions.reduce((a, b) =>
      Math.abs(centerFor(a) - x) < Math.abs(centerFor(b) - x) ? a : b
    )
    p.target = v.id
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
  const clickNode = (e, item, kind) => {
    if (suppress.current) {
      suppress.current = false
      e.preventDefault()
      return
    }
    onVersion(item[kind], item)
  }
  const groups = releaseGroups.map((g) => ({ ...g, left: xFor(g.date) }))
  const lanes = []
  for (const g of groups) {
    let lane = 0
    while ((lanes[lane] ?? -200) > g.left) {
      lane++
    }
    g.lane = lane
    lanes[lane] = g.left + 118
  }
  return (
    <div className="ml-timeline-wrap">
      <div className="ml-timeline-toolbar">
        <span>{historical ? '10 月 · 真实记录回看' : '11 月 · 需求交付安排'}</span>
        <div className="ml-actions">
          <button className="btn btn-ghost" onClick={() => position('history')}>
            10 月
          </button>
          <button className="btn btn-secondary" onClick={() => position('future')}>
            11 月
          </button>
        </div>
      </div>
      <div
        className="ml-timeline-scroll"
        ref={scroll}
        role="region"
        aria-label="里程碑需求时间轴"
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
          <div className="ml-month-row">
            <div className="ml-sticky-label">需求 / 负责人</div>
            <div className="ml-month-scale">
              <div style={{ width: 31 * dayWidth }}>
                <span>2026 年 10 月</span>
              </div>
              <div style={{ width: 30 * dayWidth }}>
                <span>2026 年 11 月</span>
              </div>
            </div>
          </div>
          <div className="ml-date-row">
            <div className="ml-sticky-label">日期</div>
            <div className="ml-date-track">
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i} style={{ left: i * 7 * dayWidth }}>
                  {new Date(axisStart + i * 7 * dayMs).toISOString().slice(5, 10).replace('-', '/')}
                </span>
              ))}
            </div>
          </div>
          <div className="ml-version-row">
            <div className="ml-sticky-label">
              <span>{historical ? '项目发布记录' : '目标版本'}</span>
              {historical && <small>项目发布与需求交付分别取证</small>}
            </div>
            <div className="ml-version-track">
              {groups.map((g) => (
                <button
                  className="ml-release-marker"
                  key={g.date}
                  style={{ left: g.left, top: g.lane * 25 + 5 }}
                  onClick={() => onReleases(g)}
                >
                  <b>{g.label}</b>
                  <small>{g.date.slice(5).replace('-', '/')}</small>
                </button>
              ))}
              {fixedVersions.map((v) => (
                <button
                  className={`ml-fixed-version ${
                    currentDay >= v.start && currentDay <= v.end ? 'current' : ''
                  }`}
                  key={v.id}
                  style={{ left: xFor(v.start), width: xFor(v.end) - xFor(v.start) + dayWidth }}
                  onClick={() => onVersion(v.id)}
                >
                  <b>{v.id}</b>
                  <small>
                    {v.start.slice(5).replace('-', '/')}—{v.end.slice(-2)}
                  </small>
                </button>
              ))}
            </div>
          </div>
          {rows.map((item) => (
            <div
              className={`ml-timeline-row ${!historical && !item.included ? 'deferred' : ''}`}
              key={item.id}
            >
              <div className="ml-sticky-label">
                {historical ? (
                  <>
                    <small>
                      {item.planVersion} · {item.displayGoal} · {item.owner}
                    </small>
                    <button className="ml-row-title" onClick={() => onHistory(item)}>
                      {item.title}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="ml-row-meta">
                      <small>
                        P{item.priority} · {item.owner}
                      </small>
                      {planning && (
                        <input
                          type="checkbox"
                          aria-label={`纳入 ${item.title}`}
                          checked={item.included}
                          onChange={(e) => onEdit({ ...item, included: e.target.checked }, true)}
                        />
                      )}
                    </div>
                    <button className="ml-row-title" onClick={() => onEdit(item)}>
                      {item.title}
                      {planning && <Pencil size={11} />}
                    </button>
                    <span>
                      {item.included ? `截止 ${item.due.slice(5).replace('-', '/')}` : '暂不安排'}{' '}
                      {item.included && deadlineWarning(item) && <em>{deadlineWarning(item)}</em>}
                    </span>
                  </>
                )}
              </div>
              <div className="ml-track" style={{ width: totalDays * dayWidth }}>
                {historical ? (
                  item.result?.decision?.recordedAt ? (
                    <button
                      className={`ml-history-event ${
                        item.result.decision.outcome === 'not-met' ? 'not-met' : ''
                      }`}
                      style={{ left: xFor(item.result.decision.recordedAt) - 54 }}
                      onClick={() => onHistory(item)}
                    >
                      <span>验收 · {outcomeLabel(item.result.decision.outcome)}</span>
                      <small>
                        {item.result.decision.recordedAt.slice(5, 10).replace('-', '/')}
                      </small>
                    </button>
                  ) : (
                    <span className="ml-history-unknown">验收时间与 Pre / Release 未记录</span>
                  )
                ) : (
                  item.included && (
                    <>
                      {drag?.id === item.id && (
                        <div
                          className="ml-drop-target"
                          style={{
                            left: xFor(versionById[drag.target].start),
                            width: 7 * dayWidth
                          }}
                        />
                      )}
                      {['pre', 'release'].map((kind) => {
                        const target =
                          drag?.id === item.id && drag.kind === kind ? drag.target : item[kind]
                        return (
                          <button
                            key={kind}
                            className={`ml-delivery-node ${kind} ${planning ? 'editable' : ''} ${drag?.id === item.id && drag.kind === kind ? 'dragging' : ''}`}
                            style={{
                              left: centerFor(versionById[target]) - 65,
                              top: kind === 'pre' ? 10 : 56
                            }}
                            aria-label={`${item.title} · ${kind === 'pre' ? 'Pre版本' : 'Release版本'} · ${item[kind]}`}
                            title={
                              planning
                                ? '拖动调整版本；Shift+左右键移动一版；回车进入版本总览'
                                : '进入对应版本总览'
                            }
                            onPointerDown={(e) => down(e, item, kind)}
                            onPointerMove={move}
                            onPointerUp={up}
                            onPointerCancel={cancel}
                            onClick={(e) => clickNode(e, item, kind)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                suppress.current = false
                              }
                              if (
                                planning &&
                                e.shiftKey &&
                                ['ArrowLeft', 'ArrowRight'].includes(e.key)
                              ) {
                                e.preventDefault()
                                const i =
                                  versionIndex(item[kind]) + (e.key === 'ArrowRight' ? 1 : -1)
                                if (fixedVersions[i]) {
                                  onMove(item.id, kind, fixedVersions[i].id)
                                }
                              }
                            }}
                          >
                            <span>
                              <i />
                              {kind === 'pre' ? 'Pre版本' : 'Release版本'}
                              <ExternalLink size={11} />
                            </span>
                            <small>{target}</small>
                          </button>
                        )
                      })}
                    </>
                  )
                )}
              </div>
            </div>
          ))}
          {rows.length === 0 && <div className="ml-timeline-empty">还没有支撑需求</div>}
          <div
            className="ml-now-line"
            style={{ left: labelWidth + xFor(currentDay) + dayWidth / 2 }}
          />
        </div>
      </div>
    </div>
  )
}

function App() {
  const [draft, setDraft] = useState(loadDraft),
    [published, setPublished] = useState(() => structuredClone(initial))
  const [scenario, setScenario] = useState('ready'),
    [planning, setPlanning] = useState(false),
    [phase, setPhase] = useState('future'),
    [hasHistory, setHasHistory] = useState(true),
    [hasPublished, setHasPublished] = useState(true)
  const [modal, setModal] = useState(null),
    [reviewStage, setReviewStage] = useState('draft'),
    [theme, setTheme] = useState('light'),
    [notice, setNotice] = useState(''),
    [saveError, setSaveError] = useState('')
  const board = useRef(null)
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft))
      setSaveError('')
    } catch {
      setSaveError('浏览器无法保存草案，刷新后修改会丢失。')
    }
  }, [draft])
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
  const current = planning ? draft : published,
    historical = phase === 'history' && hasHistory,
    empty = !planning && !hasPublished
  const included = current.requirements.filter((r) => r.included)
  const target = included.toSorted((a, b) => b.due.localeCompare(a.due))[0]
  const info = (title, text) => setModal({ type: 'info', title, text })
  const openVersion = (version, item) => {
    const history = historyPlans.find((p) => p.version === version)
    setModal(
      history ? { type: 'history-version', plan: history } : { type: 'version', version, item }
    )
  }
  const edit = (item) => {
    if (historical) {
      return
    }
    setPlanning(true)
    setScenario('planning')
    setModal({ type: 'edit', item: draft.requirements.find((r) => r.id === item.id) || item })
  }
  const change = (item) => {
    setDraft((d) => ({
      ...d,
      requirements: d.requirements.some((r) => r.id === item.id)
        ? d.requirements.map((r) => (r.id === item.id ? item : r))
        : [...d.requirements, item]
    }))
    setReviewStage('draft')
  }
  const move = (id, kind, version) => {
    const result = moveDelivery(draft, id, kind, version)
    if (result.error) {
      setNotice(result.error)
    } else {
      setDraft(result.draft)
      setReviewStage('draft')
      setNotice(`${kind === 'pre' ? 'Pre版本' : 'Release版本'}已安排到 ${version}`)
    }
  }
  const begin = () => {
    setPlanning(true)
    setScenario('planning')
    setPhase('future')
    requestAnimationFrame(() =>
      board.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    )
  }
  const choose = (value) => {
    setScenario(value)
    setPlanning(value === 'planning')
    setHasHistory(value !== 'empty')
    setHasPublished(value !== 'empty')
    setPhase('future')
    setModal(null)
    setReviewStage('draft')
  }
  const publish = () => {
    setHasPublished(true)
    setPublished(structuredClone(draft))
    setPlanning(false)
    setScenario('ready')
    setReviewStage('draft')
    setModal(null)
    setNotice('正式安排已更新')
  }
  const add = () =>
    setModal({
      type: 'edit',
      item: {
        id: `demo-${crypto.randomUUID()}`,
        title: '',
        owner: '',
        priority: 2,
        included: true,
        pre: fixedVersions[0].id,
        release: fixedVersions[1].id,
        due: fixedVersions[1].target,
        preScope: '',
        releaseScope: ''
      }
    })
  return (
    <>
      <div className="ml-review-strip">
        <span>原型注释: 模拟时间 11/11；10 月按真实记录回看，11 月是演示规划，非 v0.8 承诺。</span>
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
                  value={scenario}
                  onChange={(e) => choose(e.target.value)}
                >
                  <option value="empty">尚无里程碑</option>
                  <option value="planning">制定中</option>
                  <option value="ready">已制定 · 跨月</option>
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
                  reviewStage === 'merged'
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
                      <span className="tag tag-outline">
                        {reviewStage === 'draft'
                          ? '草案'
                          : reviewStage === 'review'
                            ? '评审中'
                            : '待更新'}
                      </span>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setPlanning(false)
                          setScenario(hasPublished ? 'ready' : 'empty')
                        }}
                      >
                        查看正式安排
                      </button>
                      <button
                        className="btn btn-primary"
                        disabled={!draft.requirements.some((r) => r.included)}
                        onClick={() => setModal({ type: 'review' })}
                      >
                        {reviewStage === 'draft' ? '提交评审' : '查看评审'}
                      </button>
                    </>
                  ) : (
                    <button className="btn btn-primary" onClick={begin}>
                      规划里程碑
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
                  <div className="ml-outcomes" aria-label="阶段成果里程碑">
                    {hasHistory && (
                      <article className={`ml-outcome-card ${historical ? 'selected' : ''}`}>
                        <button
                          className="ml-outcome-select"
                          aria-pressed={historical}
                          onClick={() => setPhase('history')}
                        >
                          <small>10 月 · 历史回看</small>
                          <h3>项目管理逻辑收尾</h3>
                          <p>沿版本回看规划、执行、验收与发布主链的交付及遗留。</p>
                          <span>
                            各版目标验收：{historyCounts.met} 达成 · {historyCounts.notMet} 未达 ·{' '}
                            {historyCounts.unknown} 未记录
                          </span>
                        </button>
                      </article>
                    )}
                    <article className={`ml-outcome-card ${!historical ? 'selected' : ''}`}>
                      <button
                        className="ml-outcome-select"
                        aria-pressed={!historical}
                        onClick={() => setPhase('future')}
                      >
                        <small>11 月 · {planning ? '规划草案' : '正式安排'}</small>
                        <h3>{current.milestone.title}</h3>
                        <p>{current.milestone.outcome}</p>
                        <span>
                          {included.length} 项需求支撑 ·{' '}
                          {target
                            ? `目标 ${target.release} · ${target.due.slice(5).replace('-', '/')}`
                            : '尚未安排交付'}
                        </span>
                      </button>
                      {planning && (
                        <IconAction
                          label="编辑阶段成果"
                          icon={Pencil}
                          className="ml-outcome-edit"
                          onClick={() => setModal({ type: 'milestone' })}
                        />
                      )}
                    </article>
                  </div>
                  <div className="ml-support-head">
                    <div>
                      <h3>支撑需求</h3>
                      <span>
                        {historical
                          ? `${historicalRows.length} 项目标 · 按来源版本回看`
                          : `${new Set(included.map((r) => r.owner)).size} 位负责人 · ${included.length} 项纳入`}
                      </span>
                    </div>
                    {planning && !historical && (
                      <button className="btn btn-secondary" onClick={add}>
                        <Plus size={13} />
                        添加需求
                      </button>
                    )}
                  </div>
                  <Timeline
                    historical={historical}
                    rows={historical ? historicalRows : current.requirements}
                    planning={planning}
                    onEdit={(item, immediate) => (immediate ? change(item) : edit(item))}
                    onMove={move}
                    onVersion={openVersion}
                    onHistory={(item) => setModal({ type: 'history', item })}
                    onReleases={(group) => setModal({ type: 'releases', group })}
                  />
                  <div className="ml-material-origin">
                    <span>
                      {historical
                        ? '来源：已提交计划、人工验收与发布快照 · 截至 2026-10-28'
                        : planning
                          ? '规划草案 · 尚未合入'
                          : '正式安排'}
                    </span>
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
      {modal?.type === 'edit' && (
        <EditRequirement item={modal.item} save={change} close={() => setModal(null)} />
      )}
      {modal?.type === 'milestone' && (
        <EditMilestone
          value={draft.milestone}
          save={(value) => {
            setDraft((d) => ({ ...d, milestone: value }))
            setReviewStage('draft')
          }}
          close={() => setModal(null)}
        />
      )}
      {modal?.type === 'version' && (
        <VersionBridge item={modal.item} version={modal.version} close={() => setModal(null)} />
      )}
      {modal?.type === 'history' && (
        <HistoryDetail item={modal.item} close={() => setModal(null)} />
      )}
      {modal?.type === 'history-version' && (
        <HistoryVersion plan={modal.plan} close={() => setModal(null)} />
      )}
      {modal?.type === 'review' && (
        <PlanningReviewPanel
          chosen={draft.requirements.filter((r) => r.included)}
          milestone={draft.milestone}
          stage={reviewStage}
          setStage={setReviewStage}
          publish={publish}
          close={() => setModal(null)}
        />
      )}
      {modal?.type === 'releases' && (
        <Modal title={`${modal.group.date} · 项目发布`} close={() => setModal(null)}>
          {modal.group.rows.map((r) => (
            <section className="ml-source-item" key={r.tag}>
              <h3>
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.tag} ↗
                </a>
              </h3>
              <p>{r.prerelease ? 'GitHub 项目预发布' : 'GitHub 项目发布'}</p>
              <p className="muted">{r.publishedAt} · 不推定所有需求已交付 Pre 或 Release</p>
            </section>
          ))}
        </Modal>
      )}
      {modal?.type === 'sources' && (
        <Modal title="里程碑资料来源" close={() => setModal(null)} wide>
          <p>
            原型注释: 10 月阶段主题由人归纳，按真实版本材料恢复；不倒编月初承诺、日期或需求级 Pre /
            Release。
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
            <section>
              <h3>实际项目发布</h3>
              {publishedReleases.map((r) => (
                <p key={r.tag}>
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {r.tag} ↗
                  </a>
                  <small> · {r.publishedAt.slice(5, 10)}</small>
                </p>
              ))}
            </section>
          </div>
          <p className="ml-footnote">
            原型注释: 11 月六个方向、人员与排期为演示。阶段成果未自动判达成；材料写入与 #334
            跨屏字段仍未接入真实协议。
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
          <p>原型注释: 恢复本浏览器中的演示安排，原生浏览器批注保留。</p>
          <footer>
            <button
              className="btn btn-primary"
              onClick={() => {
                setDraft(structuredClone(initial))
                setPublished(structuredClone(initial))
                choose('ready')
              }}
            >
              重置
            </button>
          </footer>
        </Modal>
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
