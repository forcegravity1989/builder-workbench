import { MilestoneReviewNav } from './milestone-review-nav.jsx'
import { AddMilestone, MilestoneGuide } from './milestones-roadmap.jsx'
import { Timeline } from './milestones-timeline.jsx'
import {
  day,
  dateOf,
  latestFeatureEnd,
  scheduleProblem,
  editVersionName
} from './milestones-sdlc.js'
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left.js'
import Undo2 from 'lucide-react/dist/esm/icons/undo-2.js'
import Redo2 from 'lucide-react/dist/esm/icons/redo-2.js'
import RotateCcw from 'lucide-react/dist/esm/icons/rotate-ccw.js'
import { planWeek } from './milestones-calendar.js'
import { IconAction } from '../../version-workspace/prototype/g2-icon-action.jsx'
import {
  clone,
  loadCases,
  freshCases,
  storageKey,
  changesBetween,
  incomplete,
  currentDay,
  dateExample
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
function App() {
  const [cases, setCases] = useState(loadCases),
    [caseId, setCaseId] = useState('existing'),
    [planning, setPlanning] = useState(
      new URLSearchParams(location.search).get('mode') === 'planning'
    )
  const [actualScenario, setActualScenario] = useState('normal')
  const [navigation, setNavigation] = useState(() => ({
      date: localStorage.getItem(`${storageKey}-date`) || dateOf(day(currentDay) - 10),
      sequence: 1
    })),
    [modal, setModal] = useState(null),
    [theme, setTheme] = useState('light'),
    [notice, setNotice] = useState(''),
    [saveError, setSaveError] = useState(''),
    [newFeature, setNewFeature] = useState(null),
    [submitting, setSubmitting] = useState(false),
    [submitError, setSubmitError] = useState(''),
    [submitDemo, setSubmitDemo] = useState(''),
    [validationAttempt, setValidationAttempt] = useState(false)
  const submitLock = useRef(false)
  const board = useRef(null),
    state = cases[caseId],
    dirty = JSON.stringify(state.draft) !== JSON.stringify(state.submitted),
    current = planning ? state.draft : state.published,
    empty = !planning && !state.published
  useEffect(() => {
    if (new URLSearchParams(location.search).has('review')) {
      board.current?.scrollIntoView({ block: 'start' })
    }
  }, [])
  const histories = useRef({
    existing: { past: [], future: [], field: null },
    empty: { past: [], future: [], field: null }
  })
  const history = histories.current[caseId]
  const plan = current || state.draft,
    changes = changesBetween(state.submitted, state.draft),
    problem = incomplete(state.draft, state.submitted)
  const setState = (updater) => setCases((all) => ({ ...all, [caseId]: updater(all[caseId]) }))
  const editPlan = (updater, fieldEdit = false) => {
    const draft = updater(state.draft)
    if (JSON.stringify(draft) === JSON.stringify(state.draft)) {
      return
    }
    const field = fieldEdit
      ? document.activeElement?.matches('input.ml-inline,textarea.ml-inline')
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
    setCaseId(value === 'empty' ? 'empty' : 'existing')
    setPlanning(value === 'planning')
    setSubmitError('')
    setModal(null)
  }
  const begin = () => {
    setPlanning(true)
    requestAnimationFrame(() =>
      board.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    )
  }
  const changeFeature = (id, patch) =>
    editFieldPlan((p) => ({
      ...p,
      features: p.features.map((f) => (f.id === id ? { ...f, ...patch } : f))
    }))
  const remove = (feature) => {
    editPlan((p) => ({ ...p, features: p.features.filter((f) => f.id !== feature.id) }))
  }
  const removeMaintenance = (featureId, deliveryId) => {
    editPlan((p) => ({
      ...p,
      features: p.features.map((f) =>
        f.id === featureId
          ? {
              ...f,
              deliveries: f.deliveries.filter(
                (d) => d.id !== deliveryId || d.stages.some((s) => s.phase !== 'Maintain')
              )
            }
          : f
      )
    }))
    setNotice('已删除此段 Maintain，可撤销')
  }
  const add = (viewDate = currentDay, viewEnd = day(viewDate) + 14) => {
    const id = `demo-${crypto.randomUUID()}`,
      start = Math.max(day(currentDay), day(viewDate))
    if (start + 7 > viewEnd) {
      navigate(dateOf(start - 3))
    }
    setValidationAttempt(false)
    setNewFeature(id)
    editPlan((p) => ({
      ...p,
      features: [
        {
          id,
          title: '',
          owner: '',
          deliveries: [
            { id: crypto.randomUUID(), stages: [{ phase: 'Build', start, end: start + 7 }] },
            {
              id: crypto.randomUUID(),
              stages: [{ phase: 'Maintain', start: start + 7, end: start + 14 }]
            }
          ]
        },
        ...p.features
      ]
    }))
  }
  const requestReview = () => {
    if (problem) {
      setValidationAttempt(true)
      setNotice(problem)
      requestAnimationFrame(() => {
        const field = [...document.querySelectorAll('[data-required="true"]')].find(
          (el) => !el.value.trim()
        )
        field?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        field?.focus({ preventScroll: true })
      })
      return
    }
    setModal({ type: 'review' })
  }
  const arrangeMaintenance = (feature, viewDate, viewEnd) => {
    const start = Math.max(day(viewDate), day(currentDay), latestFeatureEnd(feature))
    const delivery = {
      id: crypto.randomUUID(),
      stages: [{ phase: 'Maintain', start, end: start + 7 }]
    }
    const next = {
      ...state.draft,
      features: state.draft.features.map((f) =>
        f.id === feature.id ? { ...f, deliveries: [...f.deliveries, delivery] } : f
      )
    }
    const error = scheduleProblem(next, state.draft)
    if (error) {
      setNotice(error)
      return
    }
    editPlan(() => next)
    if (start + 7 > viewEnd) {
      navigate(dateOf(start - 3))
    }
    setNotice('已追加一周维护，可拖动调整日期；误加可撤销')
  }
  const restore = () => {
    setSubmitError('')
    setState((s) => ({ ...s, draft: clone(s.submitted) }))
  }
  const submit = async (demo) => {
    const preview = ['success', 'failure'].includes(demo)
    if (submitLock.current || (!preview && (!dirty || problem || state.review === 'merged'))) {
      return
    }
    submitLock.current = true
    setSubmitting(true)
    setSubmitDemo(preview ? demo : '')
    setSubmitError('')
    setModal(null)
    setNotice('正在提交评审…')
    const snapshot = clone(state.draft),
      submittedCase = caseId
    // Demonstrates one background request; no Git or provider writes occur here.
    await new Promise((resolve) => setTimeout(resolve, 1800))
    if (demo === 'failure') {
      setSubmitError('暂时无法连接代码托管平台。请检查网络后重试。')
      setNotice('演示：提交失败，修改保留在当前页面，请重试')
    } else if (preview) {
      setNotice('演示：评审已创建，待合入')
    } else {
      setCases((all) => ({
        ...all,
        [submittedCase]: { ...all[submittedCase], submitted: snapshot, review: 'open' }
      }))
      history.past = []
      history.future = []
      history.field = null
      setNotice(state.review === 'open' ? '评审已更新，待合入' : '评审已创建，待合入')
    }
    submitLock.current = false
    setSubmitting(false)
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
  const addMilestone = (item) => {
    const milestone = { ...item, id: crypto.randomUUID() }
    editPlan((p) => ({
      ...p,
      milestones: [...p.milestones, milestone]
    }))
    setModal(null)
    navigate(milestone.date)
  }
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
        <MilestoneReviewNav screen="project" />
        <div className="ml-actions">
          <select
            aria-label="原型注释：实际进度读取场景"
            value={actualScenario}
            onChange={(event) => setActualScenario(event.target.value)}
          >
            <option value="normal">
              {dateExample
                ? '原型注释：A 规划 1–5 → 采用 1–10'
                : '原型注释：A 未上线 → B 已上线 → C 维护未完成'}
            </option>
            <option value="unlinked">原型注释：名称未匹配，无实际结果</option>
            <option value="ambiguous">原型注释：名称匹配不唯一</option>
            <option value="error">原型注释：验收读取失败</option>
          </select>
          <select
            aria-label="原型注释：播放提交反馈"
            value=""
            disabled={submitting}
            onChange={(e) => submit(e.target.value)}
          >
            <option value="" disabled>
              演示提交反馈
            </option>
            <option value="success">播放：提交成功</option>
            <option value="failure">播放：提交失败</option>
          </select>
          <IconAction
            label="重置原型"
            icon={RefreshCw}
            disabled={submitting}
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
          if (event.target.matches('input.ml-inline,textarea.ml-inline')) {
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
                  disabled={submitting}
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
                  <MilestoneGuide planning={planning} />
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
                          disabled={submitting || (state.review === 'none' && !dirty)}
                          title={
                            dirty
                              ? problem || '核对本次变更'
                              : state.review === 'none'
                                ? '没有未提交修改'
                                : '查看已提交的评审'
                          }
                          onClick={requestReview}
                        >
                          {submitting
                            ? '提交中…'
                            : dirty
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
                          disabled={submitting}
                          onClick={() => setModal({ type: 'review', viewOnly: true })}
                        >
                          {state.review === 'merged' ? '更新正式安排' : '查看评审'}
                        </button>
                      )}
                    </>
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
                  <Timeline
                    onChangeMilestone={(item) =>
                      editFieldPlan((p) => ({
                        ...p,
                        milestones: p.milestones.map((m) => (m.id === item.id ? item : m))
                      }))
                    }
                    onRemoveMilestone={(id) =>
                      editPlan((p) => ({
                        ...p,
                        milestones: p.milestones.filter((m) => m.id !== id)
                      }))
                    }
                    onAddMilestone={(item) => setModal({ type: 'milestone', item })}
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
                    onMaintain={arrangeMaintenance}
                    onRemoveMaintenance={removeMaintenance}
                    onDelete={remove}
                    onNavigate={navigate}
                    onNotice={setNotice}
                    validationAttempt={validationAttempt}
                    onApply={(next) =>
                      editPlan(() => ({
                        ...next,
                        features: next.features.map((f) => ({
                          ...f,
                          deliveries: f.deliveries.toSorted(
                            (a, b) => a.stages[0].start - b.stages[0].start
                          )
                        }))
                      }))
                    }
                    onVersion={openVersion}
                    newFeature={newFeature}
                  />
                  {submitError && (
                    <div className="ml-submit-error" role="status">
                      <span>{submitDemo ? '演示：提交失败' : '提交失败'}</span>
                      <button
                        className="btn btn-ghost"
                        disabled={submitting || (!submitDemo && (Boolean(problem) || !dirty))}
                        onClick={() => submit(submitDemo ? 'success' : undefined)}
                      >
                        重试
                      </button>
                      <button
                        className="btn btn-ghost"
                        onClick={() => info('提交失败', submitError)}
                      >
                        查看详情
                      </button>
                    </div>
                  )}
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
      {modal?.type === 'milestone' && (
        <AddMilestone item={modal.item} save={addMilestone} close={() => setModal(null)} />
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
          viewOnly={modal.viewOnly}
          invalid={submitting || Boolean(problem)}
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
            原型注释: 特性、人员与日期排期均为样例；原型不会写入项目材料或提交评审。
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
        <div className="ml-toast" role="status" data-error={notice.includes('失败')}>
          {submitting && <RefreshCw size={14} className="ml-spinner" />}
          {notice}
          {!submitting && notice.startsWith('评审已') && (
            <button
              className="btn btn-ghost"
              onClick={() => setModal({ type: 'review', viewOnly: true })}
            >
              查看评审
            </button>
          )}
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
