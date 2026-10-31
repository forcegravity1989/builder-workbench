import { InlineField } from './milestones-fields.jsx'
import { Timeline } from './milestones-timeline.jsx'
import {
  defaultStages,
  fitVersions,
  laneConflict,
  settleWindows,
  editVersionName
} from './milestones-sdlc.js'
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left.js'
import Undo2 from 'lucide-react/dist/esm/icons/undo-2.js'
import Redo2 from 'lucide-react/dist/esm/icons/redo-2.js'
import RotateCcw from 'lucide-react/dist/esm/icons/rotate-ccw.js'
import Flag from 'lucide-react/dist/esm/icons/flag.js'
import { availableWeek, latestMonth, planWeek } from './milestones-calendar.js'
import { IconAction } from '../../version-workspace/prototype/g2-icon-action.jsx'
import {
  clone,
  loadCases,
  freshCases,
  storageKey,
  changesBetween,
  incomplete,
  currentDay
} from './milestones-data.js'
import { historicalRows, historyPlans, historyCounts, sourceUrl } from './milestones-history.js'
import { Sidebar, ProjectContext, Scoreboard } from './milestones-shell.jsx'
import {
  Modal,
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
  RefreshCw
} = window.BWPrototypeDependencies
function MilestoneAxis({ plan, planning, changeMilestone, navigate, navigation }) {
  const scroll = useRef(null),
    pan = useRef(null)
  const months = React.useMemo(
    () =>
      plan.months
        .filter((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m.month) && (planning || m.outcome.trim()))
        .toSorted((a, b) => a.month.localeCompare(b.month)),
    [plan.months, planning]
  )
  const monthKeys = months.map((m) => m.month).join(',')
  useEffect(() => {
    const keys = monthKeys.split(',').filter(Boolean)
    const month = keys.find((key) => key >= navigation.date.slice(0, 7)) || keys.at(-1)
    const point = month && scroll.current?.querySelector(`[data-month="${month}"]`)
    if (point) {
      scroll.current.scrollTo({
        left: Math.max(
          0,
          point.offsetLeft - scroll.current.clientWidth / 2 + point.clientWidth / 2
        ),
        behavior: 'smooth'
      })
    }
  }, [navigation, monthKeys])
  if (!months.length) {
    return null
  }
  return (
    <nav
      className="ml-roadmap-scroll"
      aria-label="月度里程碑时间轴"
      ref={scroll}
      onPointerDown={(e) => {
        if (e.button !== 0 || e.target.closest('button,input')) {
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
      <div className="ml-roadmap-axis" style={{ minWidth: months.length * 240 }}>
        {months.map((m) => (
          <div className="ml-roadmap-month" key={m.month} data-month={m.month}>
            <button
              className="ml-roadmap-flag"
              aria-label={`定位里程碑 ${m.month}`}
              onClick={() => navigate(`${m.month}-01`)}
            >
              <Flag size={17} />
              <span>{m.month.replace('-', ' 年 ')} 月</span>
            </button>
            <div className="ml-roadmap-caption" title={m.outcome}>
              {planning ? (
                <InlineField
                  value={m.outcome}
                  label={`${m.month} 阶段成果`}
                  placeholder="一句阶段成果"
                  required={false}
                  change={(value) => changeMilestone(m.month, value)}
                />
              ) : (
                <span>{m.outcome || '未填写阶段成果'}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </nav>
  )
}
function App() {
  const [cases, setCases] = useState(loadCases),
    [caseId, setCaseId] = useState('existing'),
    [planning, setPlanning] = useState(false)
  const [actualScenario, setActualScenario] = useState('normal')
  const [navigation, setNavigation] = useState(() => ({
      date: `${latestMonth(cases.existing.published || cases.existing.draft)}-01`,
      sequence: 0
    })),
    [modal, setModal] = useState(null),
    [theme, setTheme] = useState('light'),
    [notice, setNotice] = useState(''),
    [saveError, setSaveError] = useState(''),
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
  const remove = (item) => {
    editPlan((p) =>
      fitVersions(
        { ...p, features: p.features.filter((f) => f.id !== item.id) },
        item.deliveries.map((d) => d.versionId)
      )
    )
  }
  const add = () => {
    const id = `demo-${crypto.randomUUID()}`
    const week = availableWeek(state.draft, currentDay)
    const first = planWeek(state.draft, week)
    const after = new Date(`${first.version.end}T00:00:00Z`)
    after.setUTCDate(after.getUTCDate() + ((8 - after.getUTCDay()) % 7 || 7))
    const nextWeek = availableWeek(first.plan, after.toISOString().slice(0, 10))
    const next = planWeek(first.plan, nextWeek)
    const fitted = fitVersions(
      {
        ...next.plan,
        features: [
          {
            id,
            month: week.start.slice(0, 7),
            title: '',
            owner: '',
            deliveries: [
              {
                versionId: first.version.id,
                stages: defaultStages(first.version)
              },
              { versionId: next.version.id, stages: defaultStages(next.version, true) }
            ]
          },
          ...next.plan.features
        ]
      },
      [first.version.id, next.version.id]
    )
    const settled = settleWindows(state.draft, fitted)
    if (settled.conflict) {
      setNotice(settled.conflict)
      return
    }
    const candidate = settled.plan
    if (laneConflict(candidate)) {
      setNotice('同一泳道不能重叠，请先为后续版本留出时间。')
      return
    }
    setNewFeature(id)
    editPlan(() => candidate)
    navigate(first.version.start)
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
  }
  const submit = () => {
    if (!dirty || problem || state.review === 'merged') {
      return
    }
    setState((s) => ({ ...s, submitted: clone(s.draft), review: 'open' }))
    history.past = []
    history.future = []
    history.field = null
  }
  const publish = () => {
    if (state.review !== 'merged') {
      return
    }
    setState((s) => ({ ...s, published: clone(s.submitted), review: 'none' }))
    setPlanning(dirty)
    setModal(null)
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
  return (
    <>
      <div className="ml-review-strip">
        <span>
          原型注释: #530 · 模拟 11/11 15:30；Issue、目标与实际阶段均为样例。
          原泳道显示实际，勾选“显示计划”可对照。日历按普通周末。
        </span>
        <div className="ml-actions">
          <select
            aria-label="原型注释：实际进度读取场景"
            value={actualScenario}
            onChange={(event) => setActualScenario(event.target.value)}
          >
            <option value="normal">原型注释：已有读数与未采集到</option>
            <option value="unlinked">原型注释：缺少目标关系</option>
            <option value="ambiguous">原型注释：目标关系无法确定</option>
            <option value="error">原型注释：本次未采集到，保留旧值</option>
          </select>
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
                <div className="ml-heading-title">
                  {planning && (
                    <IconAction
                      label="结束编辑，返回项目里程碑"
                      icon={ArrowLeft}
                      onClick={() => setPlanning(false)}
                    />
                  )}
                  <h2>项目里程碑</h2>
                </div>
                <div className="ml-actions">
                  {planning ? (
                    <>
                      <div className="ml-edit-actions" role="group" aria-label="规划编辑操作">
                        <IconAction
                          label="撤销 · Ctrl+Z"
                          icon={Undo2}
                          disabled={!history.past.length}
                          onClick={() => stepHistory()}
                        />
                        <IconAction
                          label="重做 · Ctrl+Shift+Z"
                          icon={Redo2}
                          disabled={!history.future.length}
                          onClick={() => stepHistory(true)}
                        />
                        <span className="ml-action-divider" />
                        <IconAction
                          label="放弃本次修改，恢复最近提交"
                          icon={RotateCcw}
                          disabled={!dirty}
                          onClick={() => {
                            restore()
                            history.past = []
                            history.future = []
                            history.field = null
                          }}
                        />
                      </div>
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
                          disabled={state.review === 'none' && (!dirty || Boolean(problem))}
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
                    <>
                      <button className="btn btn-primary" onClick={begin}>
                        规划里程碑
                      </button>
                      {state.review !== 'none' && (
                        <button
                          className="btn btn-secondary"
                          onClick={() => setModal({ type: 'review', viewOnly: true })}
                        >
                          {state.review === 'merged' ? '更新正式安排' : '查看评审'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {planning && problem && (
                <p className="ml-schedule-problem" role="alert">
                  {problem}
                </p>
              )}
              {empty ? (
                <div className="ml-first-plan">
                  <CalendarRange size={30} />
                  <h3>还没有里程碑</h3>
                </div>
              ) : (
                <>
                  <MilestoneAxis
                    plan={plan}
                    planning={planning}
                    changeMilestone={changeMilestone}
                    navigate={navigate}
                    navigation={navigation}
                  />
                  <Timeline
                    actualScenario={actualScenario}
                    onActualScenario={setActualScenario}
                    rows={plan.features}
                    plan={plan}
                    onAdd={add}
                    onNameWeek={nameWeek}
                    planning={planning}
                    navigation={navigation}
                    onChangeFeature={changeFeature}
                    onRenameVersion={(id, name, previous) => {
                      const result = editVersionName(
                        state.draft,
                        id,
                        name,
                        previous,
                        state.submitted
                      )
                      editFieldPlan(() => result.plan)
                      if (result.problem) {
                        setNotice(result.problem)
                      }
                    }}
                    onDelete={remove}
                    onReorder={reorder}
                    onApply={(next) => editPlan(() => next)}
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
          viewOnly={modal.viewOnly}
          invalid={Boolean(problem)}
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
