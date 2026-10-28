import { IconAction } from '../../version-workspace/prototype/g2-icon-action.jsx'
import {
  initial,
  storageKey,
  loadDraft,
  versions,
  weeks,
  versionFacts,
  deadlineWarning,
  historyVersionName
} from './milestones-data.js'
import {
  CalendarPanel,
  EditRequirement,
  Modal,
  ReferencePanel,
  PlanningSourcePanel,
  PlanningReviewPanel,
  VersionBridge
} from './milestones-panels.jsx'
import octoberPlan from '../../../../.bw/planning/v0.7/data.json'
const {
  // eslint-disable-next-line no-unused-vars
  React,
  useState,
  useEffect,
  useRef,
  createRoot,
  LayoutDashboard,
  BookOpen,
  CalendarRange,
  CalendarClock,
  MessageSquare,
  GitBranch,
  ChevronRight,
  Pencil,
  Check,
  RefreshCw,
  ExternalLink
} = window.BWPrototypeDependencies

function Sidebar({ scenario, openVersion, info, home }) {
  return (
    <aside className="ml-sidebar" aria-label="项目导航">
      <div className="ml-brand">
        <span className="ml-logo">W</span>
        <strong>Workbench</strong>
      </div>
      <button
        className="ml-nav"
        onClick={() => info('项目墙', '原型注释: 沿用当前项目墙入口，本稿固定在 BW 项目。')}
      >
        <LayoutDashboard size={16} />
        项目墙
      </button>
      <div className="ml-project-name">Builders’ Workbench</div>
      <button
        className="ml-nav"
        onClick={() => info('任务', '原型注释: 沿用原生任务列表；本稿不读写 Issue。')}
      >
        <Check size={16} />
        任务
      </button>
      <button
        className="ml-nav"
        onClick={() => info('自动化', '原型注释: 沿用原生自动化入口；本稿不创建任务。')}
      >
        <CalendarClock size={16} />
        自动化
      </button>
      <button className="ml-nav active" aria-current="page" onClick={home}>
        <LayoutDashboard size={16} />
        项目总览
      </button>
      <button className="ml-nav" onClick={() => info('知识库', '原型注释: 沿用既有知识库入口。')}>
        <BookOpen size={16} />
        知识库
      </button>
      <div className="ml-nav-rule" />
      <div className="ml-sidebar-label">版本</div>
      <button
        className="ml-nav"
        onClick={() => info('新建版本', '原型注释: 沿用原生版本准备入口，原型不创建版本或工作树。')}
      >
        ＋ 新建版本
      </button>
      {scenario !== 'empty' &&
        versions.map((v, i) => (
          <details key={v} open={i === 1}>
            <summary>
              <ChevronRight size={13} />
              {v}
              <small>11.{weeks[i]}</small>
            </summary>
            <div className="ml-subnav">
              {['总览', '计划', '任务', '验收'].map((name) => (
                <button
                  key={name}
                  onClick={() =>
                    name === '总览'
                      ? openVersion(v)
                      : info(
                          `${v} · ${name}`,
                          '原型注释: 沿用该版本原生入口；当前只预览导航上下文。'
                        )
                  }
                >
                  {name}
                </button>
              ))}
            </div>
          </details>
        ))}
      {scenario !== 'empty' && (
        <details>
          <summary>
            <ChevronRight size={13} />
            {historyVersionName}
            <small>10 月</small>
          </summary>
          <a
            className="ml-history-link"
            href="https://github.com/forcegravity1989/builder-workbench/blob/cfbc1a4c9/.bw/planning/v0.7/data.json"
            target="_blank"
            rel="noreferrer"
          >
            原计划 ↗
          </a>
        </details>
      )}
      <div className="ml-nav-rule" />
      <div className="ml-sidebar-label">项目工作区</div>
      <button
        className="ml-nav"
        onClick={() => info('原生工作区', '原型注释: 保留 #455 未归版工作树入口，不另建会话导航。')}
      >
        <GitBranch size={15} />
        未归版工作树
      </button>
      <button
        className="ml-nav"
        onClick={() => info('其他项目', '原型注释: 沿用当前项目切换入口。')}
      >
        <ChevronRight size={15} />
        其他项目
      </button>
      <div className="ml-sidebar-bottom">
        <span className="avatar">Y</span>
        <span>yuzhup</span>
      </div>
    </aside>
  )
}

function ProjectContext() {
  return (
    <>
      <div className="ml-motto">
        <small>高效执行四原则 · FranklinCovey 4DX</small>
        <p>聚焦至关重要目标 · 贯彻引领指标 · 设立振奋人心的记分牌 · 保持相互担责的节奏</p>
      </div>
      <div className="ml-context">
        <section className="ml-card">
          <h2>Builders’ Workbench</h2>
          <p>让 builders 更快、更好地做项目</p>
          <dl>
            <dt>目标用户</dt>
            <dd>Builder、Leader</dd>
            <dt>目标方向</dt>
            <dd>更多项目纳入 Workbench 管理</dd>
            <dt>远端</dt>
            <dd>forcegravity1989/builder-workbench</dd>
          </dl>
        </section>
        <section className="ml-card">
          <h2>北极星</h2>
          <p className="ml-empty-value">未配置</p>
        </section>
      </div>
    </>
  )
}

function Scoreboard({ theme }) {
  const frame = useRef(null)
  const [height, setHeight] = useState(530)
  useEffect(() => {
    const resize = (e) => {
      if (
        e.source === frame.current?.contentWindow &&
        e.origin === location.origin &&
        e.data?.type === 'bw-scoreboard-height' &&
        Number.isFinite(e.data.height)
      ) {
        setHeight(Math.max(250, Math.min(1500, e.data.height)))
      }
    }
    addEventListener('message', resize)
    return () => removeEventListener('message', resize)
  }, [])
  useEffect(() => {
    frame.current?.contentWindow?.postMessage(
      { type: 'bw-prototype-theme', theme },
      location.origin === 'null' ? '*' : location.origin
    )
  }, [theme])
  return (
    <iframe
      ref={frame}
      title="记分牌 · 复用最新指标原型"
      className="ml-scoreboard"
      src="prototype/scoreboard.html?embed=scoreboard"
      style={{ height }}
      onLoad={() =>
        frame.current?.contentWindow?.postMessage(
          { type: 'bw-prototype-theme', theme },
          location.origin === 'null' ? '*' : location.origin
        )
      }
    />
  )
}

function Timeline({ requirements, includeHistory, planning, openVersion, openHistory, edit }) {
  const scroll = useRef(null)
  const drag = useRef(null)
  const label = 230
  const unit = 25
  const october = includeHistory ? 31 : 0
  const total = (october + 30) * unit
  const monthX = october * unit
  const pan = (where) => {
    const el = scroll.current
    if (el) {
      el.scrollTo({
        left: where === 'history' ? 0 : Math.max(0, monthX - 30),
        top: where === 'history' ? chosen.length * 96 : 0,
        behavior: 'smooth'
      })
    }
  }
  useEffect(() => {
    if (scroll.current) {
      scroll.current.scrollLeft = Math.max(0, monthX - 30)
    }
  }, [monthX])
  const chosen = requirements.filter((r) => r.selected).sort((a, b) => a.priority - b.priority)
  const pointerDown = (e) => {
    if (e.button !== 0 || e.target.closest('button,a,input,select')) {
      return
    }
    drag.current = { x: e.clientX, left: scroll.current.scrollLeft }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const pointerMove = (e) => {
    if (drag.current) {
      scroll.current.scrollLeft = drag.current.left + drag.current.x - e.clientX
    }
  }
  const pointerEnd = () => {
    drag.current = null
  }
  return (
    <div className="ml-timeline-wrap">
      <div className="ml-timeline-toolbar">
        <span>{includeHistory ? '2026 年 10—11 月' : '2026 年 11 月'}</span>
        <div className="ml-actions">
          {includeHistory && (
            <button className="btn btn-ghost" onClick={() => pan('history')}>
              10 月
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => pan('current')}>
            今天 · 11/11
          </button>
        </div>
      </div>
      <div
        className="ml-timeline-scroll"
        ref={scroll}
        role="region"
        aria-label="跨月里程碑泳道"
        tabIndex={0}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerEnd}
        onPointerCancel={pointerEnd}
      >
        <div className="ml-timeline-canvas" style={{ width: label + total }}>
          <div className="ml-timeline-header">
            <div className="ml-sticky-label">大需求 / 主导人</div>
            <div className="ml-month-scale" style={{ width: total }}>
              {includeHistory && (
                <div style={{ width: 31 * unit }}>
                  2026 年 10 月 <small>已制定</small>
                </div>
              )}
              <div style={{ width: 30 * unit }}>
                2026 年 11 月 <small>{planning ? '草案' : '已制定'}</small>
              </div>
            </div>
          </div>
          <div className="ml-timeline-versions">
            <div className="ml-sticky-label">目标版本与截止</div>
            <div className="ml-date-scale" style={{ width: total }}>
              {includeHistory && (
                <div className="ml-history-scale" style={{ width: 31 * unit }}>
                  {historyVersionName} · 历史计划
                </div>
              )}
              {versions.map((v, i) => (
                <button
                  key={v}
                  className={v === 'v1.0.1' ? 'current' : ''}
                  style={{ left: monthX + (1 + i * 7) * unit, width: 7 * unit }}
                  onClick={() => openVersion(v)}
                >
                  <b>
                    {v}
                    {v === 'v1.0.1' ? ' · 当前' : ''}
                  </b>
                  <small>11.{weeks[i]}</small>
                </button>
              ))}
            </div>
          </div>
          {chosen.map((item) => (
            <div className="ml-timeline-row" key={item.id}>
              <button
                className="ml-sticky-label"
                onClick={() => (planning ? edit(item) : openVersion(item.first, item))}
              >
                <small>
                  P{item.priority} · {item.owner}
                </small>
                <b>{item.title}</b>
                <span>
                  截止 {item.due.slice(5).replace('-', '/')}{' '}
                  {deadlineWarning(item) && <em>{deadlineWarning(item)}</em>}
                </span>
              </button>
              <div className="ml-track" style={{ width: total }}>
                {[
                  { v: item.first, name: '先行 MVP' },
                  { v: item.target, name: '修理完善' }
                ].map(({ v, name }) => (
                  <button
                    key={v}
                    className={`ml-delivery-bar ${v === 'v1.0.1' ? 'current' : ''}`}
                    style={{
                      left: monthX + (1 + versions.indexOf(v) * 7) * unit + 5,
                      width: 7 * unit - 10
                    }}
                    onClick={() => openVersion(v, item)}
                  >
                    <span>
                      {name}
                      <ExternalLink size={12} />
                    </span>
                    <small>{versionFacts[v].label}</small>
                  </button>
                ))}
                <div
                  className="ml-deadline"
                  style={{ left: monthX + (Number(item.due.slice(-2)) - 0.5) * unit }}
                  title={`截止 ${item.due}`}
                >
                  ◆
                </div>
              </div>
            </div>
          ))}
          {includeHistory &&
            octoberPlan.goals.map((goal) => (
              <div className="ml-timeline-row ml-history-row" key={goal.goalId}>
                <button className="ml-sticky-label" onClick={() => openHistory(goal)}>
                  <small>{goal.owner}</small>
                  <b>{goal.title}</b>
                </button>
                <div className="ml-track" style={{ width: total }}>
                  <button
                    className="ml-history-bar"
                    style={{ width: 31 * unit - 20 }}
                    onClick={() => openHistory(goal)}
                  >
                    <span>
                      {historyVersionName} · {goal.goalId} <ExternalLink size={12} />
                    </span>
                    <small>月内日期未登记</small>
                  </button>
                </div>
              </div>
            ))}
          {chosen.length === 0 && !includeHistory && (
            <div className="ml-timeline-empty">尚未纳入大需求</div>
          )}
          <div className="ml-now-line" style={{ left: label + monthX + 10.5 * unit }} />
        </div>
      </div>
    </div>
  )
}

function Discussion() {
  return (
    <aside className="ml-discussion" aria-label="Orca 原生会话屏">
      <header className="ml-session-head">
        <MessageSquare size={16} />
        <strong>里程碑规划</strong>
      </header>
      <div className="ml-native-placeholder">
        <MessageSquare size={28} />
        <p>原型注释: Orca 原生会话屏</p>
        <dl>
          <dt>固定分支</dt>
          <dd>
            <code>bw/project</code>（拟复用）
          </dd>
          <dt>配套 Skill</dt>
          <dd>名称待确认</dd>
        </dl>
      </div>
    </aside>
  )
}

function App() {
  const [scenario, setScenario] = useState('ready')
  const [editing, setEditing] = useState(false)
  const [hasHistory, setHasHistory] = useState(true)
  const [sessionWidth, setSessionWidth] = useState(300)
  const [draft, setDraft] = useState(loadDraft)
  const [published, setPublished] = useState(() => structuredClone(initial))
  const [reviewStage, setReviewStage] = useState('draft')
  const [modal, setModal] = useState(null)
  const [selectedId, setSelectedId] = useState('DEMO-01')
  const [saveError, setSaveError] = useState('')
  const [theme, setTheme] = useState('light')
  const [toast, setToast] = useState('')
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft))
      setSaveError('')
    } catch {
      setSaveError('浏览器未能保存草案，刷新后修改会丢失。')
    }
  }, [draft])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  useEffect(() => {
    if (!toast) {
      return
    }
    const id = setTimeout(() => setToast(''), 3500)
    return () => clearTimeout(id)
  }, [toast])
  const selected = draft.requirements.find((r) => r.id === selectedId) || draft.requirements[0]
  const chosen = draft.requirements
    .filter((r) => r.selected)
    .sort((a, b) => a.priority - b.priority)
  const openCalendar = (event) =>
    setModal({ type: 'calendar', anchor: event.currentTarget.getBoundingClientRect() })
  const info = (title, text) => setModal({ type: 'info', title, text })
  const openVersion = (version, item) =>
    setModal({
      type: 'version',
      version,
      item:
        item ||
        (editing
          ? selected
          : published.requirements.find(
              (r) => r.selected && (r.first === version || r.target === version)
            ))
    })
  const change = (id, patch) => {
    setDraft((d) => ({
      ...d,
      requirements: d.requirements.map((r) => (r.id === id ? { ...r, ...patch } : r))
    }))
    setReviewStage('draft')
  }
  const edit = (item) => {
    setSelectedId(item.id)
    setModal({ type: 'edit', item })
  }
  const openHistory = (goal) =>
    info(
      `${historyVersionName} · ${goal.goalId}`,
      `${goal.title}\n\n${goal.deliverable}\n\n原型注释: 直接引用 BW v0.7 计划；未登记月内日期及 具体排期，未据此推断验收完成。`
    )
  const chooseScene = (value) => {
    setScenario(value)
    setHasHistory(value !== 'empty')
    setEditing(value === 'planning')
    setReviewStage('draft')
    setModal(null)
  }
  const startPlanning = () => {
    setEditing(true)
    setScenario('planning')
  }
  const publish = () => {
    setPublished(structuredClone(draft))
    setScenario('ready')
    setEditing(false)
    setReviewStage('draft')
    setModal(null)
    setToast('已更新正式安排')
  }
  const timeline = (
    <Timeline
      requirements={editing ? draft.requirements : published.requirements}
      includeHistory={hasHistory}
      planning={editing}
      openVersion={openVersion}
      openHistory={openHistory}
      edit={edit}
    />
  )
  const milestone = (
    <section className="ml-milestone-block" aria-label="项目里程碑">
      <div className="ml-milestone-heading">
        <h2>{editing ? '2026 年 11 月 · 里程碑规划' : '项目里程碑'}</h2>
        <div className="ml-actions">
          {editing ? (
            <>
              <span className="tag tag-outline">
                {reviewStage === 'review' ? '评审中' : reviewStage === 'merged' ? '待更新' : '草案'}
              </span>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setEditing(false)
                  setScenario('ready')
                }}
              >
                返回总览
              </button>
              <button
                className="btn btn-primary"
                disabled={chosen.length === 0}
                onClick={() => setModal({ type: 'review' })}
              >
                {reviewStage === 'draft'
                  ? '提交评审'
                  : reviewStage === 'review'
                    ? '查看评审'
                    : '更新正式总览'}
              </button>
            </>
          ) : (
            <>
              {scenario !== 'empty' && (
                <IconAction label="工作日历" icon={CalendarRange} onClick={openCalendar} />
              )}
              <button className="btn btn-primary" onClick={startPlanning}>
                规划里程碑
              </button>
            </>
          )}
        </div>
      </div>
      {scenario === 'empty' && !editing ? (
        <div className="ml-first-plan">
          <CalendarRange size={30} />
          <h3>还没有月度里程碑</h3>
        </div>
      ) : (
        <>
          {editing && (
            <section className="ml-candidates" aria-label="本月取舍">
              <div className="ml-section-head">
                <h3>
                  本月取舍 <small>{chosen.length} 项纳入</small>
                </h3>
                <button className="btn btn-ghost" onClick={openCalendar}>
                  <CalendarRange size={14} />
                  工作日历
                </button>
              </div>
              {draft.requirements.map((r) => (
                <article className={`ml-choice ${!r.selected ? 'deferred' : ''}`} key={r.id}>
                  <input
                    type="checkbox"
                    checked={r.selected}
                    aria-label={`本月纳入 ${r.title}`}
                    onChange={(e) => change(r.id, { selected: e.target.checked })}
                  />
                  <button className="ml-choice-main" onClick={() => edit(r)}>
                    <small>
                      P{r.priority} · {r.owner}
                    </small>
                    <b>{r.title}</b>
                    <p>{r.reason}</p>
                    <span>
                      {r.selected
                        ? `${r.first} MVP → ${r.target} 完善 · 截止 ${r.due.slice(5).replace('-', '/')}`
                        : '暂不安排'}
                    </span>
                  </button>
                  <IconAction label={`编辑 ${r.title}`} icon={Pencil} onClick={() => edit(r)} />
                </article>
              ))}
            </section>
          )}
          {timeline}
        </>
      )}
      {editing && (
        <div className="ml-material-origin">
          <span>草案 · bw/project</span>
          <button className="btn btn-ghost" onClick={() => setModal({ type: 'source' })}>
            查看材料来源
          </button>
        </div>
      )}
    </section>
  )
  return (
    <>
      <div className="ml-review-strip">
        <span>
          原型注释: 10 月引用 BW v0.7（展示名 v0.7.0）；当前时间模拟 11/11（v1.0.1），11
          月安排、状态与日历为示意，非 v0.8 承诺。
        </span>
        <div className="ml-actions">
          <IconAction
            label="重置原型"
            icon={RefreshCw}
            onClick={() => setModal({ type: 'reset' })}
          />
          <button
            className="btn btn-ghost"
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            aria-label="切换主题"
          >
            ◐
          </button>
        </div>
      </div>
      <div className="ml-app">
        <Sidebar
          scenario={scenario}
          openVersion={openVersion}
          info={info}
          home={() => {
            setEditing(false)
            setScenario('ready')
          }}
        />
        <div className="ml-workspace">
          <header className="ml-topbar">
            <span>
              Builders’ Workbench <ChevronRight size={13} /> 项目总览{' '}
              {editing && (
                <>
                  <ChevronRight size={13} />
                  里程碑规划
                </>
              )}
            </span>
            <div className="ml-actions">
              <label className="ml-scene-label">
                原型场景
                <select
                  className="input"
                  aria-label="原型场景"
                  value={scenario}
                  onChange={(e) => chooseScene(e.target.value)}
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
          {editing ? (
            <div
              className="ml-edit-workspace"
              style={{ gridTemplateColumns: `minmax(0,1fr) 5px ${sessionWidth}px` }}
            >
              <main className="ml-planning-board">{milestone}</main>
              <div
                className="ml-splitter"
                role="separator"
                aria-label="规划与会话分隔"
                aria-orientation="vertical"
                aria-valuemin={260}
                aria-valuemax={500}
                aria-valuenow={sessionWidth}
                tabIndex={0}
                onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
                onPointerMove={(e) => {
                  if (e.buttons === 1) {
                    setSessionWidth(
                      Math.max(
                        260,
                        Math.min(
                          500,
                          e.currentTarget.parentElement.getBoundingClientRect().right - e.clientX
                        )
                      )
                    )
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    e.preventDefault()
                    setSessionWidth((w) =>
                      Math.max(260, Math.min(500, w + (e.key === 'ArrowLeft' ? 16 : -16)))
                    )
                  }
                }}
              />
              <Discussion />
            </div>
          ) : (
            <main className="ml-main">
              <div className="ml-page-head">
                <h1>项目总览</h1>
                <button
                  className="btn btn-secondary"
                  onClick={() =>
                    reviewStage === 'merged'
                      ? publish()
                      : setToast('原型注释: 当前为本地预览，未拉取真实主干。')
                  }
                >
                  更新代码
                </button>
              </div>
              <ProjectContext />
              {milestone}
              <Scoreboard theme={theme} />
            </main>
          )}
        </div>
      </div>
      {modal?.type === 'calendar' && (
        <CalendarPanel anchor={modal.anchor} close={() => setModal(null)} />
      )}
      {modal?.type === 'edit' && (
        <EditRequirement
          item={modal.item}
          save={(item) => change(item.id, item)}
          close={() => setModal(null)}
        />
      )}
      {modal?.type === 'version' && (
        <VersionBridge item={modal.item} version={modal.version} close={() => setModal(null)} />
      )}
      {modal?.type === 'references' && <ReferencePanel close={() => setModal(null)} />}
      {modal?.type === 'source' && <PlanningSourcePanel close={() => setModal(null)} />}
      {modal?.type === 'review' && (
        <PlanningReviewPanel
          chosen={chosen}
          stage={reviewStage}
          setStage={setReviewStage}
          publish={publish}
          close={() => setModal(null)}
        />
      )}
      {modal?.type === 'info' && (
        <Modal title={modal.title} close={() => setModal(null)}>
          <p className="ml-info-text">{modal.text}</p>
        </Modal>
      )}
      {modal?.type === 'reset' && (
        <Modal title="重置原型" close={() => setModal(null)}>
          <p>原型注释: 清除本浏览器草案，恢复初始模拟安排。Orca 原生批注保留。</p>
          <footer>
            <button
              className="btn btn-primary"
              onClick={() => {
                setDraft(structuredClone(initial))
                setPublished(structuredClone(initial))
                setSelectedId('DEMO-01')
                chooseScene('ready')
              }}
            >
              重置
            </button>
          </footer>
        </Modal>
      )}
      {saveError && (
        <div className="ml-save-error" role="alert">
          {saveError}
        </div>
      )}
      {toast && (
        <div className="ml-toast" role="status">
          {toast}
        </div>
      )}
    </>
  )
}
createRoot(document.getElementById('root')).render(<App />)
