const { React, createRoot, useState, useRef } = window.BWPrototypeDependencies
import { snapshot, stages, initialReview, prior, taskRows, reviewState } from './g3-model.js'
import { Button, Icon, Field, GoalCard, ReviewItem } from './g3-components.jsx'
import { PlanningDialogs } from './g3-dialogs.jsx'

function App() {
  const [goals, setGoals] = useState(() => structuredClone(snapshot.plan.goals))
  const [tasks] = useState(taskRows)
  const [expanded, setExpanded] = useState([])
  const [revisions, setRevisions] = useState(
    Object.fromEntries(snapshot.plan.goals.map((g) => [g.goalId, 0]))
  )
  const [review, setReview] = useState(() => structuredClone(initialReview))
  const [modal, setModal] = useState(null)
  const [active, setActive] = useState('context')
  const [session, setSession] = useState(false)
  const [request, setRequest] = useState('')
  const [reading, setReading] = useState(false)
  const [started, setStarted] = useState([])
  const [scenario, setScenario] = useState('draft')
  const [archive, setArchive] = useState('none')
  const [archiveDirty, setArchiveDirty] = useState(false)
  const [archiveSnapshot, setArchiveSnapshot] = useState(null)
  const captureArchive = () => structuredClone({ goals, tasks, review, revisions, risk })
  const [notice, setNotice] = useState('')
  const [risk, setRisk] = useState('')
  const [dark, setDark] = useState(false)
  const [compact, setCompact] = useState(false)
  const [sourceError, setSourceError] = useState(false)
  const scroll = useRef(null)
  const close = React.useCallback(() => setModal(null), [])
  const unresolved = review.filter((r) => reviewState(r, revisions) !== 'addressed').length
  const edited = Object.values(revisions).filter(Boolean).length
  const move = (id) => {
    setActive(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const locate = (id) => {
    setExpanded((current) => [...new Set([...current, id])])
    setActive('goals')
    setTimeout(
      () =>
        document
          .getElementById(`goal-${id}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      0
    )
  }
  const update = (id, patch) => {
    if (archive !== 'none') {
      setArchiveDirty(true)
    }
    setGoals((current) => current.map((g) => (g.goalId === id ? { ...g, ...patch } : g)))
    setRevisions((current) => ({ ...current, [id]: current[id] + 1 }))
    setNotice('修改已保留在本次演示中')
  }
  const converse = (text) => {
    setRequest(text)
    setSession(true)
    setNotice('已打开原生会话衔接预览；未启动真实模型')
  }
  const changeScenario = (value) => {
    setScenario(value)
    if (['pr', 'changes', 'merged'].includes(value)) {
      if (!archiveSnapshot) {
        setArchiveSnapshot(captureArchive())
        setArchiveDirty(false)
      }
    } else {
      setArchiveSnapshot(null)
      setArchiveDirty(false)
    }
    setArchive(
      { draft: 'none', review: 'none', pr: 'review', changes: 'changes', merged: 'merged' }[value]
    )
    setNotice('')
    if (value === 'review') {
      move('review')
    }
    if (['pr', 'changes', 'merged'].includes(value)) {
      move('archive')
    }
    if (value === 'draft') {
      move('goals')
    }
  }
  const theme = () => {
    setDark(!dark)
    document.documentElement.dataset.theme = dark ? 'light' : 'dark'
  }
  const reset = () => {
    setGoals(structuredClone(snapshot.plan.goals))
    setReview(structuredClone(initialReview))
    setRevisions(Object.fromEntries(snapshot.plan.goals.map((g) => [g.goalId, 0])))
    setStarted([])
    setArchiveSnapshot(null)
    setArchive('none')
    setArchiveDirty(false)
    setScenario('draft')
    setRisk('')
    setNotice('已恢复 v0.7 原始快照')
    setExpanded([])
    setReading(false)
    setSourceError(false)
    setSession(false)
    move('goals')
  }
  const openTask = (task) => setModal({ type: 'task', task })
  const startTask = (task) => setModal({ type: 'start', task })
  return (
    <div className={`g3-app${compact ? ' constrained' : ''}${reading ? ' reading' : ''}`}>
      <div className="g3-demo-bar">
        <strong>设计候选</strong>
        <span>BW v0.7 真实材料 · 流程状态为演示</span>
        <label>
          体验阶段{' '}
          <select
            aria-label="体验阶段"
            value={scenario}
            onChange={(e) => changeScenario(e.target.value)}
          >
            <option value="draft">完善目标</option>
            <option value="review">评审后修改</option>
            <option value="pr">PR 等待再审</option>
            <option value="changes">PR 要求修改</option>
            <option value="merged">PR 已合入</option>
          </select>
        </label>
        <button onClick={() => setCompact(!compact)}>{compact ? '宽板' : '窄板'}</button>
        <button onClick={theme}>{dark ? '浅色' : '深色'}</button>
        <button onClick={reset}>重置</button>
        <button onClick={() => setModal({ type: 'sources' })}>设计说明</button>
      </div>
      <div className="g3-workspace">
        <aside className="g3-sidebar">
          <div className="g3-brand">
            <span>B</span>
            <strong>Workbench</strong>
          </div>
          <div className="g3-project">
            Builder Workbench <Icon name="down" size={12} />
          </div>
          <div className="g3-nav-caption">项目</div>
          <div className="g3-nav-muted">项目总览</div>
          <div className="g3-nav-muted">自动化</div>
          <div className="g3-nav-muted">知识库</div>
          <div className="g3-version">
            <Icon name="down" size={13} /> v0.7
          </div>
          <div className="g3-nav-muted nested">版本总览</div>
          <button className="g3-nav-selected" onClick={() => move('goals')}>
            <Icon name="target" /> 计划
          </button>
          <button className="g3-nav-item" onClick={() => setModal({ type: 'tasks', goal: null })}>
            任务 <span>{tasks.length}</span>
          </button>
          <div className="g3-nav-muted nested">验收</div>
          <div className="g3-nav-muted">› v0.6</div>
          <div className="g3-sidebar-bottom">
            <a
              href="http://127.0.0.1:53519/docs/05-features/version-planning/version-workspace-journey.html#storage"
              target="_blank"
              rel="noreferrer"
            >
              G2 工作区设计 ↗
            </a>
            <span>导航为上下文示意</span>
          </div>
        </aside>
        <aside className={`g3-session ${session ? 'expanded' : 'rail'}`}>
          <button
            className="g3-session-toggle"
            aria-expanded={session}
            onClick={() => setSession(!session)}
          >
            <Icon name="chat" />
            {session ? '收起会话' : '会话'}
          </button>
          {session && (
            <>
              <div className="g3-native-tabs">
                计划 · v0.7 <span>原生工作区</span>
              </div>
              <div className="g3-native-body">
                <span className="g3-eyebrow">协作上下文</span>
                <h3>和模型一起把计划说清</h3>
                <p>页面的修改和会话使用同一份版本材料。</p>
                {request && <div className="g3-request">{request}</div>}
                <p className="g3-footnote">
                  此处仅示意已有 Orca 会话的衔接，不模拟模型回答、工具执行或保存成功。
                </p>
              </div>
              <button className="g3-text-action" onClick={() => setModal({ type: 'sources' })}>
                查看复用边界
              </button>
            </>
          )}
        </aside>
        <main className="g3-main">
          <header className="g3-header">
            <div>
              <div className="g3-breadcrumb">
                Builder Workbench <span>/</span> v0.7
              </div>
              <h1>
                版本计划{' '}
                <span className="g3-header-status">
                  {archiveDirty
                    ? '有未归档修改 · 演示'
                    : archive === 'merged'
                      ? '已合入 · 演示'
                      : '工作草稿 · 演示'}
                </span>
              </h1>
            </div>
            <div className="g3-header-actions">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setReading(!reading)
                  if (!reading) {
                    setExpanded(goals.map((g) => g.goalId))
                    setSession(false)
                  }
                }}
              >
                {reading ? '返回编辑' : '评审阅读'}
              </button>
              <Button
                icon="chat"
                onClick={() =>
                  converse('围绕 v0.7 的目标、交付与验收方式讨论；先核对我的意图，再给出建议。')
                }
              >
                讨论计划
              </Button>
            </div>
          </header>
          <nav className="g3-journey" aria-label="计划旅程">
            {stages.map(([id, label, sub], i) => (
              <button
                key={id}
                aria-current={active === id ? 'step' : undefined}
                onClick={() => move(id)}
              >
                <span className="g3-step-number">{i + 1}</span>
                <span>
                  {label}
                  <small>{sub}</small>
                </span>
                {id === 'review' && <b>{unresolved}</b>}
              </button>
            ))}
          </nav>
          <div
            className="g3-scroll"
            ref={scroll}
            onScroll={() => {
              const top = scroll.current.getBoundingClientRect().top
              const current = stages.findLast(
                ([id]) => document.getElementById(id).getBoundingClientRect().top <= top + 72
              )
              if (current) {
                setActive(current[0])
              }
            }}
          >
            <section id="context" className="g3-context">
              <div className="g3-section-title">
                <h2>这次计划从哪里开始</h2>
                <button className="g3-text-action" onClick={() => setModal({ type: 'prior' })}>
                  查看上版依据 <Icon name="arrow" size={13} />
                </button>
              </div>
              {sourceError ? (
                <div className="g3-error" role="alert">
                  验收依据读取失败，尚不能展示进展。
                  <button onClick={() => setSourceError(false)}>重试读取（演示）</button>
                </div>
              ) : (
                <div className="g3-progress-list">
                  {prior.map(([id, title, text, follow]) => (
                    <div key={id}>
                      <span className="g3-id">{id}</span>
                      <strong>{title}</strong>
                      <p>{text}</p>
                      <span>{follow}</span>
                    </div>
                  ))}
                </div>
              )}
              <details className="g3-constraints">
                <summary>
                  本版约束与风险 <span>{risk ? '已填写' : '尚未填写'}</span>
                </summary>
                <Field
                  label="需要 Leader 知道的约束"
                  value={risk}
                  onChange={(value) => {
                    setRisk(value)
                    setArchiveDirty(archive !== 'none')
                  }}
                  placeholder="例如可投入时间、依赖、暂不承诺的范围；由你填写"
                />
              </details>
            </section>
            <section id="goals">
              <div className="g3-section-title">
                <div>
                  <h2>
                    本版要达成什么 <span className="g3-count">{goals.length} 个目标</span>
                  </h2>
                  <p>把结果说清，再让交付内容和 Issue 支撑它。</p>
                </div>
                <div className="g3-inline-actions">
                  <button
                    onClick={() =>
                      setExpanded(
                        expanded.length === goals.length ? [] : goals.map((g) => g.goalId)
                      )
                    }
                  >
                    {expanded.length === goals.length ? '全部收起' : '全部展开'}
                  </button>
                  <button onClick={() => setModal({ type: 'minutes' })}>预览纪要</button>
                </div>
              </div>
              <div className="g3-goal-list">
                {goals.map((goal) => (
                  <GoalCard
                    key={goal.goalId}
                    goal={goal}
                    tasks={tasks.filter((t) => t.goalId === goal.goalId)}
                    expanded={expanded.includes(goal.goalId)}
                    toggle={() =>
                      expanded.includes(goal.goalId)
                        ? setExpanded((v) => v.filter((id) => id !== goal.goalId))
                        : locate(goal.goalId)
                    }
                    update={(field, value) => update(goal.goalId, { [field]: value })}
                    coach={(g, mode) =>
                      setModal({ type: mode === 'measure' ? 'measure' : 'coach', goal: g })
                    }
                    openTask={openTask}
                    startTask={startTask}
                    addTask={(g) => setModal({ type: 'decompose', goal: g })}
                    started={started}
                    reading={reading}
                    revision={revisions[goal.goalId]}
                  />
                ))}
              </div>
              <div className="g3-goals-bottom">
                <Button icon="plus" onClick={() => setModal({ type: 'newgoal' })}>
                  添加目标
                </Button>
                <span>原始 4 个目标全部保留。</span>
                <button className="g3-text-action" onClick={() => setModal({ type: 'coverage' })}>
                  核对交付与任务覆盖 <Icon name="arrow" size={13} />
                </button>
              </div>
            </section>
            <section id="review">
              <div className="g3-section-title">
                <div>
                  <h2>
                    Leader 的要求，改到哪里了{' '}
                    <span className="g3-count">{unresolved} 项待核对</span>
                  </h2>
                  <p>意见来自 Issue 的设计示例；这里的回应不代表 Leader 已批准。</p>
                </div>
                <Button onClick={() => setModal({ type: 'meeting' })}>带入会议要求</Button>
              </div>
              <div className="g3-review-list">
                {review.map((item) => (
                  <ReviewItem
                    key={item.id}
                    item={item}
                    revisions={revisions}
                    locate={locate}
                    respond={(r) => setModal({ type: 'respond', item: r })}
                  />
                ))}
              </div>
              <div className="g3-review-end">
                <span>保留要求、回应与修改依据，随整份计划送交再次审核。</span>
                <button
                  className="g3-text-action"
                  onClick={() => {
                    setReading(true)
                    setExpanded(goals.map((g) => g.goalId))
                    setSession(false)
                    move('goals')
                  }}
                >
                  通读本次计划 <Icon name="arrow" size={13} />
                </button>
              </div>
            </section>
            <section id="archive" className="g3-archive">
              <div className="g3-section-title">
                <div>
                  <h2>把计划交回代码仓</h2>
                  <p>目标、交付约定、Issue 关联与评审落实记录一起受审。</p>
                </div>
                <Icon name="pr" size={24} />
              </div>
              <div className="g3-archive-facts">
                <div>
                  <small>本次计划</small>
                  <strong>
                    {goals.length} 个目标 · {tasks.length} 个 Issue
                  </strong>
                </div>
                <div>
                  <small>相较原始材料</small>
                  <strong>{edited} 个目标有修改</strong>
                </div>
                <div>
                  <small>评审要求</small>
                  <strong>{unresolved ? `${unresolved} 项仍需核对` : 'Builder 已逐项回应'}</strong>
                </div>
              </div>
              {archive === 'none' ? (
                <div className="g3-archive-next">
                  <p>准备归档 PR 后，由 Leader 再次审核。未决定的事项可以明确列入 Draft PR。</p>
                  <Button primary icon="pr" onClick={() => setModal({ type: 'archive' })}>
                    准备归档 PR
                  </Button>
                </div>
              ) : (
                <div className="g3-pr-state">
                  <div>
                    <span className="g3-status">
                      {
                        {
                          review: '等待 Leader 再审',
                          changes: 'Leader 要求修改',
                          merged: '已合入'
                        }[archive]
                      }{' '}
                      · 演示
                    </span>
                    <h3>v0.7 版本计划及评审落实</h3>
                    {archiveDirty && (
                      <p>
                        {archive === 'merged'
                          ? '已有新草稿，尚未提交后续归档 PR。'
                          : '本地内容已变化，尚未更新到归档 PR。'}
                      </p>
                    )}
                    <p>
                      {archive === 'changes'
                        ? '需说明 G3 开工入口与 G2 工作区归属的边界；修改后更新同一个 PR。'
                        : archive === 'merged'
                          ? archiveDirty
                            ? '已合入的修订保持不变，新修改需另提 PR 再审。'
                            : '这份演示计划已归档。目标是否达成，仍需后续交付与验收。'
                          : 'PR 创建、Builder 回应和 Leader 批准是不同事实。'}
                    </p>
                  </div>
                  <div className="g3-inline-actions">
                    {archive === 'merged' && (
                      <Button onClick={() => setModal({ type: 'archive', frozen: true })}>
                        查看已合入材料
                      </Button>
                    )}
                    {(archive !== 'merged' || archiveDirty) && (
                      <Button primary={archiveDirty} onClick={() => setModal({ type: 'archive' })}>
                        {archive === 'merged'
                          ? '准备后续归档 PR'
                          : archive === 'changes'
                            ? '核对并更新 PR'
                            : '查看归档草稿'}
                      </Button>
                    )}
                  </div>
                </div>
              )}
              <details className="g3-archive-detail">
                <summary>归档包含什么</summary>
                <ul>
                  <li>版本目标、交付件、验收方式、指标承诺与风险。</li>
                  <li>关联 Issue 的引用，远端正文与状态仍在任务平台。</li>
                  <li>评审要求、Builder 回应与修改依据（材料字段待设计确认）。</li>
                </ul>
                <p>
                  归档由 Git 提交和 PR/MR 承载；工作树登记与会话历史沿用 Orca，Git
                  归档不等于保存全部会话。
                </p>
              </details>
            </section>
            <footer className="g3-source-footer">
              材料源于 BW v0.7 @ f5ac309b。真实计划已由{' '}
              <a href={snapshot.archive.url} target="_blank" rel="noreferrer">
                PR #386
              </a>{' '}
              合入；以上修改与流程状态只保留在当前页面。
              <button onClick={() => setModal({ type: 'sources' })}>来源与设计取舍</button>
            </footer>
          </div>
          <div className="g3-bottom-bar">
            <span role="status">{notice || '本地交互演示 · 刷新后恢复原始快照'}</span>
            <button onClick={() => move(active === 'review' ? 'archive' : 'review')}>
              {active === 'review' ? '核对归档内容' : '核对评审要求'}{' '}
              <Icon name="arrow" size={14} />
            </button>
          </div>
        </main>
      </div>
      {modal && (
        <PlanningDialogs
          key={modal.type + (modal.goal?.goalId || modal.task?.number || modal.item?.id || '')}
          {...{
            modal,
            close,
            goals,
            tasks,
            review,
            revisions,
            risk,
            archive,
            setArchive,
            setScenario,
            update,
            converse,
            locate,
            openTask,
            startTask,
            setReview,
            setNotice,
            setGoals,
            setRevisions,
            setExpanded,
            setStarted,
            started,
            setSourceError,
            setArchiveDirty,
            archiveSnapshot,
            submitArchive: () => {
              setArchiveSnapshot(captureArchive())
              setArchive('review')
              setArchiveDirty(false)
              setScenario('pr')
            }
          }}
          {...(modal.frozen ? archiveSnapshot : {})}
        />
      )}
    </div>
  )
}
createRoot(document.getElementById('root')).render(<App />)
