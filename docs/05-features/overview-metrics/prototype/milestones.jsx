import { IconAction } from '../../version-workspace/prototype/g2-icon-action.jsx'
import {
  initial,
  storageKey,
  loadDraft,
  versions,
  weeks,
  versionFacts,
  deadlineWarning,
  calendarDays
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
  ArrowRight,
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
            v0.7<small>10 月</small>
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
                  v0.7 · 历史计划
                </div>
              )}
              {versions.map((v, i) => (
                <button
                  key={v}
                  className={v === 'B02' ? 'current' : ''}
                  style={{ left: monthX + (1 + i * 7) * unit, width: 7 * unit }}
                  onClick={() => openVersion(v)}
                >
                  <b>
                    {v}
                    {v === 'B02' ? ' · 当前' : ''}
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
                    className={`ml-delivery-bar ${v === 'B02' ? 'current' : ''}`}
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
                      {octoberPlan.version} · {goal.goalId} <ExternalLink size={12} />
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

function Discussion({
  selected,
  draft,
  proposal,
  setProposal,
  apply,
  mode,
  setMode,
  prompt,
  setPrompt,
  propose
}) {
  return (
    <aside className="ml-discussion" aria-label="里程碑规划会话">
      <header className="ml-session-head">
        <MessageSquare size={16} />
        <strong>里程碑规划</strong>
        <small>bw/project</small>
      </header>
      <div className="ml-discussion-body">
        <div className="ml-session-context">
          <small>当前需求</small>
          <b>{selected.title}</b>
        </div>
        <div className="ml-model-message">
          <span className="ml-model-avatar">W</span>
          <div>
            <b>Workbench</b>
            <p>
              本月先做这两项。第一项先在 B01 交 MVP，B02 用试用反馈修理；第二项从 B02
              开始，避免同时握手。
            </p>
          </div>
        </div>
        {proposal && (
          <section className="ml-proposal" aria-label="模型建议预览">
            <small>待采纳的建议</small>
            <h3>{proposal.title}</h3>
            <p>{proposal.text}</p>
            {proposal.changes.map((c) => {
              const old = draft.requirements.find((r) => r.id === c.id)
              return (
                <div className="ml-change" key={c.id}>
                  <b>{old.title}</b>
                  {c.selected === false ? (
                    <p>本月纳入 → 暂不安排</p>
                  ) : (
                    <>
                      <p>
                        先行 {old.first} → {c.first || old.first} · 后续 {old.target} →{' '}
                        {c.target || old.target}
                      </p>
                      <p>
                        截止 {old.due} → {c.due || old.due}
                      </p>
                    </>
                  )}
                </div>
              )
            })}
            <div className="ml-actions">
              {proposal.changes.length > 0 && (
                <button className="btn btn-primary" onClick={apply}>
                  采纳到草案
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => setProposal(null)}>
                继续讨论
              </button>
            </div>
          </section>
        )}
        {draft.decisions.length > 0 && (
          <details className="ml-decisions">
            <summary>已采纳结论 · {draft.decisions.length}</summary>
            {draft.decisions.map((d, i) => (
              <p key={i}>{d}</p>
            ))}
          </details>
        )}
      </div>
      <div className="ml-composer">
        <details className="ml-prototype-controls">
          <summary>原型注释: 模型回复为固定样例</summary>
          <label className="field">
            建议样例
            <select
              className="input"
              aria-label="建议样例"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value)
                setProposal(null)
              }}
            >
              <option value="mvp">调整先行与后续版本</option>
              <option value="focus">减少本月并行</option>
              <option value="calendar">核对工作日历</option>
            </select>
          </label>
        </details>
        <textarea
          className="input"
          aria-label="规划讨论输入"
          value={prompt}
          onInput={(e) => {
            setPrompt(e.currentTarget.value)
            setProposal(null)
          }}
          placeholder="和模型讨论取舍或调整安排…"
        />
        <div className="ml-session-send">
          <span>工作模型</span>
          <button className="btn btn-primary" disabled={!prompt.trim()} onClick={propose}>
            发送 <ArrowRight size={14} />
          </button>
        </div>
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
  const [proposal, setProposal] = useState(null)
  const [mode, setMode] = useState('mvp')
  const [prompt, setPrompt] = useState('本月人手有限，先让一个 MVP 给内部试用，后续再修理完善。')
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
    setProposal(null)
    setReviewStage('draft')
  }
  const edit = (item) => {
    setSelectedId(item.id)
    setModal({ type: 'edit', item })
  }
  const openHistory = (goal) =>
    info(
      `${octoberPlan.version} · ${goal.goalId}`,
      `${goal.title}\n\n${goal.deliverable}\n\n原型注释: 直接引用 BW v0.7 计划；未登记月内日期及 B 映射，未据此推断验收完成。`
    )
  const chooseScene = (value) => {
    setScenario(value)
    setHasHistory(value !== 'empty')
    setEditing(value === 'planning')
    setProposal(null)
    setReviewStage('draft')
    setModal(null)
  }
  const startPlanning = () => {
    setEditing(true)
    setScenario('planning')
    setProposal(null)
  }
  const propose = () => {
    if (mode === 'focus') {
      setProposal({
        title: '先保证一项可用交付',
        text: '把第二项暂缓到下次月度讨论，保留候选和取舍理由。不会删除需求。',
        changes: [{ id: 'DEMO-02', selected: false }]
      })
    } else if (mode === 'calendar') {
      const dates = chosen.map((item) => {
        const day = calendarDays().find((d) => d.date === item.due)
        return `${item.title}：${item.due}（${!day ? '日历未覆盖' : day.work ? '工作日' : '休息日'}）`
      })
      setProposal({
        title: '核对当前截止日',
        text: dates.length
          ? `${dates.join('；')}。11/14 是预置样例中的加班周六，不自动增加团队容量，也不移动截止。`
          : '尚未纳入大需求，暂无截止可核对。',
        changes: []
      })
    } else {
      setProposal({
        title: '为试用反馈多留一个 B 版本',
        text: '建议第一项在 B01 先行交 MVP，B03 修理完善，截止 11/20。下方按当前草案显示差异；B03 还未开始计划，具体范围留到版本内收敛。',
        changes: [{ id: 'DEMO-01', first: 'B01', target: 'B03', due: '2026-11-20' }]
      })
    }
  }
  const apply = () => {
    setDraft((d) => ({
      ...d,
      requirements: d.requirements.map((r) => ({
        ...r,
        ...proposal.changes.find((c) => c.id === r.id)
      })),
      decisions: [...d.decisions, proposal.title]
    }))
    setProposal(null)
    setReviewStage('draft')
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
                  setProposal(null)
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
                <IconAction
                  label="工作日历"
                  icon={CalendarRange}
                  onClick={() => setModal({ type: 'calendar' })}
                />
              )}
              <button className="btn btn-primary" onClick={startPlanning}>
                {scenario === 'empty' ? '制定首个月度规划' : '规划里程碑'}
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
                <button className="btn btn-ghost" onClick={() => setModal({ type: 'calendar' })}>
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
          原型注释: 10 月引用 BW v0.7；当前时间模拟 11/11（B02），11 月安排、状态与日历为示意，非
          v0.8 承诺。
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
                  <option value="empty">尚无月度版本</option>
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
              <Discussion
                selected={selected}
                draft={draft}
                proposal={proposal}
                setProposal={setProposal}
                apply={apply}
                mode={mode}
                setMode={setMode}
                prompt={prompt}
                setPrompt={setPrompt}
                propose={propose}
              />
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
      {modal?.type === 'calendar' && <CalendarPanel close={() => setModal(null)} />}
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
