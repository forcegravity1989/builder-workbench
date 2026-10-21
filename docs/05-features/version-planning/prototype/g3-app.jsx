const { React, createRoot, useState, useRef } = window.BWPrototypeDependencies
import {
  snapshot,
  stages,
  scenes,
  initialMinutes,
  minutesSections,
  prior,
  postponed,
  taskRows,
  g2Url
} from './g3-model.js'
import { Icon, IconButton, GoalRow, MinutesCard, AnnotationTray } from './g3-components.jsx'

function App() {
  const [goals, setGoals] = useState(() => structuredClone(snapshot.plan.goals))
  const [scene, setScene] = useState('full')
  const [minutes, setMinutes] = useState(() => structuredClone(initialMinutes))
  const [annotations, setAnnotations] = useState([])
  const [annotateTarget, setAnnotateTarget] = useState(null)
  const [expanded, setExpanded] = useState([])
  const [editingGoal, setEditingGoal] = useState(null)
  const [active, setActive] = useState('context')
  const [session, setSession] = useState(false)
  const [notice, setNotice] = useState('')
  const [handoff, setHandoff] = useState(null)
  const [prHandoff, setPrHandoff] = useState(false)
  const [dark, setDark] = useState(false)
  const [compact, setCompact] = useState(false)
  const [notes, setNotes] = useState(false)
  const [sourceError, setSourceError] = useState(false)
  const scroll = useRef(null)
  const navigation = useRef(null)
  const tasks = taskRows(scene)
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
  const switchScene = (value) => {
    setScene(value)
    setNotice('')
    setPrHandoff(false)
    setHandoff(null)
  }
  const archiveStatus =
    { MERGED: '已合入', OPEN: '待合入', CLOSED: '已关闭' }[snapshot.archive.state] || '状态未知'
  const reset = () => window.location.reload()

  return (
    <div className={`g3-app ${compact ? 'constrained' : ''}`}>
      <div className="g3-demo-bar">
        <strong>G3 设计候选</strong>
        <span>本轮只设计计划屏 · BW v0.7 真实材料 · 编辑仅在本页演示</span>
        <label className="g3-scene">
          时期
          <select
            aria-label="切换演示时期场景"
            value={scene}
            onChange={(e) => switchScene(e.target.value)}
          >
            {scenes.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
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
            未填写独立进展字段；延期引用来自人工验收记录中明确的遗留项， 不按 open
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
            <strong>纪要与批注</strong>：纪要示例源自 #385 边界讨论，仅演示；固定三节格式。
            批注托盘交互参照 Orca 浏览器批注（选中元素 → 右下角托盘 → 发送给会话）， BW
            板面元素的捕获层适配留实现设计。会议 ID 现阶段由 Builder 提供， 不提供时仅凭在线批注也可生成；群组
            / WeLink 自动获取待用户组旅程设计。
          </p>
          <p>
            <strong>衔接留白</strong>：验收按钮直接打开现有验收屏原型（仍是 v0.5
            样例）；生产应按已选定的 v0.6 固定来源定位，不回退其他版本。本轮不改验收屏。开工交给 G2
            原生创建器；归档 PR 由 Orca 原生 PR 页承接，不跳外部浏览器。
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
            <strong>时期场景</strong>：右上「时期」下拉是原型场景切换器（不进生产界面），
            用于逐阶段检查计划未建、目标未拆 Issue 时的空态与操作动线。
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
                      <span>延期</span>
                      <div className="g3-carryover-links">
                        {postponed.map((item) => (
                          <span
                            className="g3-carryover-goal"
                            key={item.goalId}
                            title={`${item.title} · ${item.conclusion}，延期带入本版`}
                          >
                            {item.goalId} {item.title}
                          </span>
                        ))}
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
                      <span>遗留</span>
                      <span className="g3-muted">上版会议未单独记录</span>
                    </div>
                  </div>
                </div>
              )}
            </section>
            <section id="goals">
              <div className="g3-section-title">
                <h2>
                  v0.7 <span>本版目标</span>
                  <small>{scene === 'none' ? '未建' : `${goals.length} 个目标`}</small>
                </h2>
                {scene !== 'none' && (
                  <IconButton
                    name={expanded.length === goals.length ? 'down' : 'right'}
                    label={expanded.length === goals.length ? '全部收起' : '全部展开'}
                    onClick={() => {
                      setEditingGoal(null)
                      setExpanded(
                        expanded.length === goals.length ? [] : goals.map((g) => g.goalId)
                      )
                    }}
                  />
                )}
              </div>
              {scene === 'none' ? (
                <div className="g3-empty-board">
                  <p>v0.7 计划尚未建立。</p>
                  <button onClick={assistant}>与计划助手新建计划</button>
                  <span className="g3-muted">也可在版本下拉查看已有版本（示意）</span>
                </div>
              ) : (
                <>
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
                        annotate={(target) => {
                          setAnnotateTarget(target)
                          setNotice('')
                        }}
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
                          { goalId: id, title: '', acceptance: '', owner: '' }
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
                </>
              )}
            </section>
            <section id="minutes">
              <div className="g3-section-title">
                <h2>
                  会议纪要
                  <small>
                    {scene === 'full'
                      ? minutes.confirmed
                        ? '已人工确认 · 示例'
                        : '待人工确认 · 示例'
                      : '未生成'}
                  </small>
                </h2>
                <span className="g3-title-actions">
                  <IconButton
                    name="annotate"
                    label="在线批注（会议速记来源）"
                    onClick={() => {
                      setAnnotateTarget('板面自由批注')
                      setNotice('')
                    }}
                  />
                  <IconButton
                    name="agent"
                    label="打开计划助手整理纪要（可提供会议 ID）"
                    onClick={assistant}
                  />
                </span>
              </div>
              <p className="g3-minutes-guidance g3-annotation">
                纪要由计划助手从在线批注与可选的会议转写稿总结，固定三节格式，经人工确认后生效；
                随后与助手基于纪要调整上方目标。会议 ID 现阶段由 Builder
                提供，不提供时仅凭批注也可生成；群组 / WeLink 自动获取是后续演进。
              </p>
              {scene === 'full' ? (
                <MinutesCard
                  minutes={minutes}
                  sections={minutesSections}
                  assistant={assistant}
                  update={(patch) => {
                    setMinutes({ ...minutes, ...patch })
                    setNotice('本页演示修改 · 刷新后恢复原始材料')
                  }}
                />
              ) : (
                <p className="g3-empty">
                  会后由计划助手基于在线批注与可选转写稿生成；批注可从上方「在线批注」入口或目标 /
                  Issue 行的批注按钮开始。
                </p>
              )}
            </section>
            {scene === 'full' ? (
              <section id="archive" className="g3-archive">
                <Icon name="pr" size={20} />
                <div>
                  <h2>
                    计划归档 PR{' '}
                    <a
                      className="g3-id"
                      href={snapshot.archive.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      #386
                    </a>
                  </h2>
                  <p>Leader 在 Orca 原生 PR 页再次审核计划，合入后归档。</p>
                </div>
                <IconButton
                  name="arrow"
                  label="打开原生 PR 页（衔接示意）"
                  onClick={() => {
                    setPrHandoff(true)
                    setNotice('')
                  }}
                />
                <span className="g3-archive-status">{archiveStatus}</span>
              </section>
            ) : (
              <section id="archive" className="g3-archive">
                <Icon name="pr" size={20} />
                <div>
                  <h2>计划归档 PR</h2>
                  <p>未创建 · 由计划助手在原生会话中发起，Leader 在 Orca 原生 PR 页再审。</p>
                </div>
              </section>
            )}
            <p className="g3-demo-footnote g3-annotation">
              PR 状态来自固定读取；本页演示编辑不会更新远端 PR。创建或更新归档 PR
              在计划助手的原生会话中完成，查看入口为 Orca 原生 PR 页。
            </p>
          </div>
          <footer className="g3-footer" role="status">
            {prHandoff ? (
              <div className="g3-footer-handoff">
                <span>归档 PR #386 在 Orca 原生 PR 页打开 · 衔接示意，不跳外部浏览器。</span>
                <IconButton
                  name="close"
                  label="收起原生 PR 说明"
                  onClick={() => setPrHandoff(false)}
                />
              </div>
            ) : handoff ? (
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
      {annotateTarget && (
        <AnnotationTray
          target={annotateTarget}
          annotations={annotations}
          onClose={() => setAnnotateTarget(null)}
          onRecord={(text) =>
            setAnnotations((current) => [
              ...current,
              { id: `${Date.now()}-${current.length}`, object: annotateTarget, text }
            ])
          }
          onSend={() => {
            setAnnotations([])
            setAnnotateTarget(null)
            assistant()
            setNotice('批注已发送给计划助手 · 演示不真正注入会话')
          }}
        />
      )}
    </div>
  )
}
createRoot(document.getElementById('root')).render(React.createElement(App))
