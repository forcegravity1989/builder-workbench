const { React, createRoot, useState, useRef } = window.BWPrototypeDependencies
import { snapshot, stages, initialReview, prior, taskRows, g2Url } from './g3-model.js'
import { Icon, IconButton, Field, GoalRow, ReviewItem } from './g3-components.jsx'

function App() {
  const [goals, setGoals] = useState(() => structuredClone(snapshot.plan.goals))
  const [review, setReview] = useState(() => structuredClone(initialReview))
  const [expanded, setExpanded] = useState([])
  const [editingGoal, setEditingGoal] = useState(null)
  const [active, setActive] = useState('context')
  const [session, setSession] = useState(false)
  const [message, setMessage] = useState('')
  const [risk, setRisk] = useState('')
  const [riskEditing, setRiskEditing] = useState(false)
  const [notice, setNotice] = useState('')
  const [handoff, setHandoff] = useState(null)
  const [dark, setDark] = useState(false)
  const [compact, setCompact] = useState(false)
  const [notes, setNotes] = useState(false)
  const [sourceError, setSourceError] = useState(false)
  const scroll = useRef(null)
  const composer = useRef(null)
  const tasks = taskRows()
  const move = (id) => {
    setActive(id)
    document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }
  const locate = (id) => {
    setExpanded((current) => [...new Set([...current, id])])
    setActive('goals')
    requestAnimationFrame(() =>
      document.getElementById(`goal-${id}`)?.scrollIntoView({ block: 'start' })
    )
  }
  const assistant = () => {
    setSession(true)
    requestAnimationFrame(() => composer.current?.focus())
  }
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
            <strong>界面边界</strong>：左侧导航属于 G2；计划助手复用原生会话，只打开 /
            聚焦，不注入或自动发送提示。这里只演示布局，未接模型。
          </p>
          <p>
            <strong>数据来源</strong>：v0.7 计划及 Issue 为固定读取；上版三行是 v0.6
            验收说明与下一步的人工摘要，人工结论来自同一来源，并非“实际交付”原字段。该历史来源没有单独的风险标记，遗留
            / 风险列只摘录验收中的后续事项，不推导风险等级。
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
          <div className="g3-scope">
            <strong>G2 外框示意</strong>
            <span>导航 / 工作区不在本轮设计范围</span>
            <a href={`${g2Url}#storage`} target="_blank" rel="noreferrer">
              查看 G2 设计 <Icon name="arrow" size={13} />
            </a>
          </div>
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
            {stages.map(([id, title], i) => (
              <button
                key={id}
                onClick={() => move(id)}
                aria-current={active === id ? 'location' : undefined}
              >
                <span>{String(i + 1).padStart(2, '0')}</span>
                {title}
              </button>
            ))}
          </nav>
          <div
            className="g3-scroll"
            ref={scroll}
            onScroll={() => {
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
                <div className="g3-prior-table">
                  <div className="g3-prior-labels">
                    <span>上版目标 / 人工结论</span>
                    <span>验收摘要</span>
                    <span>遗留 / 风险摘要</span>
                  </div>
                  {prior.map((item) => (
                    <div className="g3-prior-row" key={item.id}>
                      <div>
                        <span className="g3-id">{item.id}</span>
                        <strong>{item.title}</strong>
                        <small>{item.outcome}</small>
                      </div>
                      <p>{item.result}</p>
                      <p>{item.next}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="g3-risk-row">
                <strong>本版风险 / 约束</strong>
                {!riskEditing && <span>{risk || '尚未补充'}</span>}
                <IconButton
                  name={riskEditing ? 'check' : 'edit'}
                  label={riskEditing ? '结束编辑风险' : '编辑本版风险 / 约束'}
                  onClick={() => setRiskEditing(!riskEditing)}
                />
              </div>
              {riskEditing && (
                <Field
                  label="本版风险 / 约束"
                  value={risk}
                  onChange={setRisk}
                  rows={1}
                  placeholder="补充本版依赖、投入与范围约束"
                />
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
                <span>与计划助手讨论目标、拆解 Issue；会议后在同一会话提供会议 ID。</span>
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
                一般意见直接修改目标；范围取舍、承诺变化等重要事项在这里回应，与 Leader 单独确认。
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
        <aside className={`g3-session ${session ? 'expanded' : 'rail'}`}>
          <div className="g3-session-toggle">
            <IconButton
              name={session ? 'close' : 'agent'}
              label={session ? '收起计划助手' : '打开计划助手侧栏'}
              aria-expanded={session}
              onClick={() => setSession(!session)}
            />
            {!session && <span>计划助手</span>}
          </div>
          {session && (
            <>
              <div className="g3-session-head">
                <div className="g3-agent-avatar">
                  <Icon name="agent" size={22} />
                </div>
                <div>
                  <h2>计划助手</h2>
                  <span>Builder Workbench · v0.7</span>
                </div>
              </div>
              <div className="g3-native-label">原生计划会话 · 位置示意</div>
              <div className="g3-session-body">
                <h3>一起把这一版想清楚</h3>
                <div className="g3-assistant-topic">
                  <strong>目标要带来什么变化</strong>
                  <p>说出你想改善的问题，一起明确交付内容和能检查的验收标准。</p>
                </div>
                <div className="g3-assistant-topic">
                  <strong>哪些 Issue 支撑交付</strong>
                  <p>先查仓库已有 Issue，再按项目规范拆解、关联，避免重复建单。</p>
                </div>
                <div className="g3-assistant-topic">
                  <strong>评审后，什么需要再确认</strong>
                  <p>提供会议 ID，整理遗留建议。普通意见直接改目标，重要取舍由你确认后记录。</p>
                </div>
              </div>
              <div className="g3-composer">
                <textarea
                  ref={composer}
                  aria-label="给计划助手的消息"
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="讨论 G1、拆解 Issue，或粘贴会议 ID…"
                />
                <div>
                  <span>原型未接模型</span>
                  <button className="g3-icon-button" aria-label="发送（原型未接模型）" disabled>
                    <Icon name="send" />
                  </button>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
createRoot(document.getElementById('root')).render(React.createElement(App))
