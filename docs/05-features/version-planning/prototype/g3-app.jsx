const { React, createRoot, useState, useRef } = window.BWPrototypeDependencies
import { snapshot, stages, initialReview, prior, taskRows, g2Url } from './g3-model.js'
import { Icon, IconButton, GoalRow, ReviewItem } from './g3-components.jsx'

function App() {
  const [goals, setGoals] = useState(() => structuredClone(snapshot.plan.goals))
  const [review, setReview] = useState(() => structuredClone(initialReview))
  const [expanded, setExpanded] = useState([])
  const [editingGoal, setEditingGoal] = useState(null)
  const [active, setActive] = useState('context')
  const [session, setSession] = useState(false)
  const [notice, setNotice] = useState('')
  const [handoff, setHandoff] = useState(null)
  const [dark, setDark] = useState(false)
  const [compact, setCompact] = useState(false)
  const [notes, setNotes] = useState(false)
  const [sourceError, setSourceError] = useState(false)
  const scroll = useRef(null)
  const navigation = useRef(null)
  const tasks = taskRows()
  const move = (id) => {
    navigation.current = id
    setActive(id)
    document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }
  const locate = (id) => {
    navigation.current = 'goals'
    setExpanded((current) => [...new Set([...current, id])])
    setActive('goals')
    requestAnimationFrame(() =>
      document.getElementById(`goal-${id}`)?.scrollIntoView({ block: 'start' })
    )
  }
  const toggleSession = (open) => {
    navigation.current = active
    setSession(open)
    requestAnimationFrame(() => document.getElementById(active)?.scrollIntoView({ block: 'start' }))
  }
  const assistant = () => toggleSession(true)
  const update = (id, field, value) => {
    setGoals((current) => current.map((g) => (g.goalId === id ? { ...g, [field]: value } : g)))
    setNotice('本页演示修改 · 刷新后恢复原始材料')
  }
  const reset = () => window.location.reload()

  return (
    <div className={`g3-app ${compact ? 'constrained' : ''}`}>
      <div className="g3-demo-bar">
        <strong>G3 设计候选</strong>
        <span>本轮只设计计划屏 · BW v0.7 真实材料 · 编辑仅在本页演示</span>
        <button onClick={() => setCompact(!compact)}>{compact ? '恢复宽度' : '窄板'}</button>
        <button
          onClick={() => {
            setDark(!dark)
            document.documentElement.dataset.theme = dark ? 'light' : 'dark'
          }}
        >
          {dark ? '浅色' : '深色'}
        </button>
        <button onClick={reset}>重置</button>
        <button aria-expanded={notes} onClick={() => setNotes(!notes)}>
          设计说明
        </button>
      </div>
      {notes && (
        <div className="g3-design-notes">
          <p>
            <strong>界面边界</strong>：左侧导航属于 G2；计划助手在左侧完整复用 Orca 原生会话，只打开
            / 聚焦，不注入或自动发送提示。这里只演示布局，未接模型。
          </p>
          <p>
            <strong>数据来源</strong>：上版只回显固定验收中的进展与实际交付，不加工成摘要。 v0.6
            未填写独立进展字段；遗留 Issue 引用来自人工验收记录中明确的遗留项， 不按 open
            状态自动推断。会议遗留未单独记录。目标短名仅用于导航。
            <a
              href="https://github.com/forcegravity1989/builder-workbench/blob/e43528cae57424bb0973c99c6e3c03af075c1198/.bw/planning/v0.6/acceptance.json"
              target="_blank"
              rel="noreferrer"
            >
              完整验收材料 ↗
            </a>
          </p>
          <p>
            <strong>衔接留白</strong>：验收按钮直接打开现有验收屏原型（仍是 v0.5
            样例）；生产应按已选定的 v0.6 固定来源定位，不回退其他版本。本轮不改验收屏。开工交给 G2
            原生创建器；PR 直接打开 GitHub 的真实 #386。
          </p>
          <p>
            <strong>参考实践</strong>：
            <a
              href="https://primer.style/product/components/tooltip/accessibility/"
              target="_blank"
              rel="noreferrer"
            >
              GitHub Primer 图标提示
            </a>{' '}
            ·{' '}
            <a href="https://linear.app/docs/project-milestones" target="_blank" rel="noreferrer">
              Linear 目标与 Issue 就近组织
            </a>{' '}
            ·{' '}
            <a
              href="https://code.visualstudio.com/docs/chat/chat-overview"
              target="_blank"
              rel="noreferrer"
            >
              VS Code 持续会话
            </a>
            。具体取舍对照见{' '}
            <a
              href="https://github.com/forcegravity1989/builder-workbench/blob/codex/v07-g3-plan-journey/docs/05-features/version-planning/spec.md"
              target="_blank"
              rel="noreferrer"
            >
              设计依据
            </a>
            。
          </p>
          <p>
            <strong>重要评审</strong>
            ：仅展示一条边界讨论示例，回应与握手状态由人填写；不统计普通修改、不抓 PR
            评论、不保存前后快照。
            <button onClick={() => setSourceError(!sourceError)}>
              {sourceError ? '恢复来源演示' : '演示来源读取失败'}
            </button>
          </p>
        </div>
      )}
      <div className={`g3-workspace ${session ? 'with-session' : ''}`}>
        <aside className="g3-sidebar">
          <div className="g3-brand">
            <span>B</span>
            <strong>Workbench</strong>
          </div>
          <div className="g3-project">Builder Workbench</div>
          <div className="g3-nav-muted">项目总览</div>
          <div className="g3-nav-muted">自动化</div>
          <div className="g3-nav-muted">知识库</div>
          <div className="g3-version">
            <Icon name="down" size={12} /> v0.7
          </div>
          <div className="g3-nav-muted nested">版本总览</div>
          <div className="g3-nav-selected">
            <Icon name="target" size={14} />
            计划
          </div>
          <div className="g3-nav-muted nested">
            任务 <span>{tasks.length}</span>
          </div>
          <div className="g3-nav-muted nested">验收</div>
          <div className="g3-nav-muted">› v0.6</div>
          <div className="g3-scope">
            <strong>G2 外框示意</strong>
            <span>导航与工作区由 G2 设计</span>
            <a href={`${g2Url}#storage`} target="_blank" rel="noreferrer">
              查看 G2 设计 <Icon name="arrow" size={13} />
            </a>
          </div>
        </aside>
        <aside
          className={`g3-session ${session ? 'expanded' : 'rail'}`}
          aria-label="左侧 Orca 原生计划会话"
        >
          <div className="g3-session-toggle">
            <IconButton
              name={session ? 'close' : 'agent'}
              label={session ? '收起原生计划会话' : '展开原生计划会话'}
              aria-expanded={session}
              onClick={() => toggleSession(!session)}
            />
            <span>计划助手</span>
          </div>
          {session && (
            <div className="g3-native-workspace">
              <Icon name="agent" size={28} />
              <h2>Orca 原生会话</h2>
              <p>完整复用标签、历史、输入与工具</p>
              <small>这里只示意会话位置，不另设计聊天界面</small>
            </div>
          )}
        </aside>
        <main className="g3-main">
          <header className="g3-header">
            <div>
              <div className="g3-breadcrumb">
                Builder Workbench <span>/</span> v0.7
              </div>
              <h1>版本计划</h1>
            </div>
            <IconButton
              name="agent"
              label="打开计划助手"
              className="g3-agent-button"
              onClick={assistant}
            />
          </header>
          <nav className="g3-journey" aria-label="计划旅程">
            {stages.map(([id, title, detail], i) => (
              <button
                key={id}
                onClick={() => move(id)}
                aria-current={active === id ? 'location' : undefined}
              >
                <span className="g3-stage-number">{i + 1}</span>
                <span className="g3-stage-copy">
                  <strong>{title}</strong>
                  <small>{detail}</small>
                </span>
              </button>
            ))}
          </nav>
          <div
            className="g3-scroll"
            ref={scroll}
            onFocusCapture={() => {
              navigation.current = null
            }}
            onWheel={() => {
              navigation.current = null
            }}
            onPointerDown={() => {
              navigation.current = null
            }}
            onTouchStart={() => {
              navigation.current = null
            }}
            onKeyDown={(event) => {
              if (
                ['PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End', ' '].includes(
                  event.key
                )
              ) {
                navigation.current = null
              }
            }}
            onScroll={() => {
              // A short final section may hit the scroll limit before reaching the top.
              if (navigation.current) {
                return
              }
              const pane = scroll.current
              if (pane.scrollHeight - pane.scrollTop - pane.clientHeight < 2) {
                setActive('archive')
                return
              }
              const top = pane.getBoundingClientRect().top
              const current = stages.findLast(
                ([id]) => document.getElementById(id).getBoundingClientRect().top <= top + 60
              )
              if (current) {
                setActive(current[0])
              }
            }}
          >
            <section id="context" className="g3-context">
              <div className="g3-section-title">
                <h2>
                  v0.6 <span>验收回顾</span>
                </h2>
                <IconButton
                  name="arrow"
                  label="打开验收屏（现有原型）"
                  href="../version-acceptance/prototype.html"
                />
              </div>
              {sourceError ? (
                <div className="g3-error" role="alert">
                  验收来源读取失败，结果未知。
                  <button onClick={() => setSourceError(false)}>重试（演示）</button>
                </div>
              ) : (
                <div className="g3-prior-card">
                  <div className="g3-prior-labels">
                    <span>上版目标</span>
                    <span>进展 / 实际交付</span>
                  </div>
                  {prior.map((item) => (
                    <div className="g3-prior-row" key={item.goalId}>
                      <div className="g3-prior-goal">
                        <span className="g3-id">{item.goalId}</span>
                        <strong>{item.title}</strong>
                        <small>{item.conclusion}</small>
                      </div>
                      <div className="g3-prior-delivery">
                        {item.progress && <p>{item.progress}</p>}
                        {item.deliveries.map((delivery) => (
                          <p key={delivery.location}>{delivery.title}</p>
                        ))}
                        {!item.progress && !item.deliveries.length && (
                          <span className="g3-muted">未填写进展 / 实际交付</span>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="g3-carryover">
                    <div>
                      <span>遗留 Issue</span>
                      <div className="g3-carryover-links">
                        {snapshot.priorAcceptance.leftoverIssues.map((issue) => (
                          <a
                            key={issue.number}
                            href={issue.url}
                            target="_blank"
                            rel="noreferrer"
                            title={issue.title}
                          >
                            #{issue.number}
                          </a>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span>会议遗留事项</span>
                      <span className="g3-muted">上版未单独记录</span>
                    </div>
                  </div>
                </div>
              )}
            </section>
            <section id="goals">
              <div className="g3-section-title">
                <h2>
                  v0.7 <span>本版目标</span>
                  <small>{goals.length} 个目标</small>
                </h2>
                <IconButton
                  name={expanded.length === goals.length ? 'down' : 'right'}
                  label={expanded.length === goals.length ? '全部收起' : '全部展开'}
                  onClick={() => {
                    setEditingGoal(null)
                    setExpanded(expanded.length === goals.length ? [] : goals.map((g) => g.goalId))
                  }}
                />
              </div>
              <div className="g3-goal-list">
                {goals.map((goal) => (
                  <GoalRow
                    key={goal.goalId}
                    editing={editingGoal === goal.goalId}
                    setEditing={(value) => setEditingGoal(value ? goal.goalId : null)}
                    goal={goal}
                    tasks={tasks.filter((t) => t.goalId === goal.goalId)}
                    expanded={expanded.includes(goal.goalId)}
                    toggle={() => {
                      setEditingGoal(null)
                      setExpanded((current) =>
                        current.includes(goal.goalId)
                          ? current.filter((id) => id !== goal.goalId)
                          : [...current, goal.goalId]
                      )
                    }}
                    update={(field, value) => update(goal.goalId, field, value)}
                    assistant={assistant}
                    startTask={(task) => {
                      setHandoff(task)
                      setNotice('')
                    }}
                  />
                ))}
              </div>
              <div className="g3-goals-bottom">
                <IconButton
                  name="plus"
                  label="添加目标"
                  onClick={() => {
                    const id = `G${goals.length + 1}`
                    setGoals((current) => [
                      ...current,
                      { goalId: id, title: '', deliverable: '', acceptance: '', owner: '' }
                    ])
                    setExpanded((current) => [...current, id])
                    setEditingGoal(id)
                    requestAnimationFrame(() =>
                      document.getElementById(`goal-${id}`)?.scrollIntoView({ block: 'nearest' })
                    )
                  }}
                />
                <span>与计划助手一起明确目标、拆解 Issue。</span>
              </div>
            </section>
            <section id="review">
              <div className="g3-section-title">
                <h2>
                  重要评审事项<small>{review.length} 项 · 示例</small>
                </h2>
                <IconButton name="agent" label="向计划助手提供会议 ID" onClick={assistant} />
              </div>
              <p className="g3-review-guidance">
                一般意见直接修改目标，重要取舍在这里与 Leader 确认。向计划助手提供会议
                ID，可一起整理。
              </p>
              {review.map((item) => (
                <ReviewItem
                  key={item.id}
                  item={item}
                  locate={() => locate(item.goal)}
                  update={(patch) =>
                    setReview((current) =>
                      current.map((r) => (r.id === item.id ? { ...r, ...patch } : r))
                    )
                  }
                />
              ))}
            </section>
            <section id="archive" className="g3-archive">
              <Icon name="pr" size={20} />
              <div>
                <h2>
                  计划归档 PR <span className="g3-id">#386</span>
                </h2>
                <p>Leader 在代码仓再次审核计划，合入后归档。</p>
              </div>
              <IconButton name="arrow" label="打开归档 PR #386" href={snapshot.archive.url} />
              <span className="g3-archive-status">原始材料：已合入</span>
            </section>
            <p className="g3-demo-footnote">
              PR 状态来自固定读取；本页演示编辑不会更新远端 PR。创建或更新归档 PR
              在计划助手的原生会话中完成。
            </p>
          </div>
          <footer className="g3-footer" role="status">
            {handoff ? (
              <div className="g3-footer-handoff">
                <span>#{handoff.number} 开工衔接示意 · 由 G2 原生创建器承接，保留用户选择。</span>
                <IconButton
                  name="arrow"
                  label="查看 G2 开工设计"
                  href={`${g2Url}#current-questions`}
                />
                <IconButton name="close" label="收起开工说明" onClick={() => setHandoff(null)} />
              </div>
            ) : (
              notice || '本页为交互原型 · 所有编辑仅保留在本次演示中'
            )}
          </footer>
        </main>
      </div>
    </div>
  )
}
createRoot(document.getElementById('root')).render(React.createElement(App))
