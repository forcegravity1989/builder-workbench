const { React, createRoot, useState, useRef, useEffect } = window.BWPrototypeDependencies
import {
  snapshot,
  stages,
  scenes,
  initialMinutes,
  leftoverIssues,
  meetingDirectives,
  taskRows,
  g2Url
} from './g3-model.js'
import { Icon, IconButton, GoalRow, MinutesCard, AnnotationPanel } from './g3-components.jsx'

function App() {
  const [goals, setGoals] = useState(() => structuredClone(snapshot.plan.goals))
  const [scene, setScene] = useState('full')
  const [minutes, setMinutes] = useState(() => structuredClone(initialMinutes))
  const [metricCommits, setMetricCommits] = useState({})
  const [annotations, setAnnotations] = useState([])
  const [annotating, setAnnotating] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [annotateTarget, setAnnotateTarget] = useState(null)
  const [expanded, setExpanded] = useState([])
  const [editingGoal, setEditingGoal] = useState(null)
  const [active, setActive] = useState('context')
  const [session, setSession] = useState(false)
  const [notice, setNotice] = useState('')
  const [handoff, setHandoff] = useState(null)
  const [sentRequest, setSentRequest] = useState(null)
  const [prHandoff, setPrHandoff] = useState(false)
  const [dark, setDark] = useState(false)
  const [compact, setCompact] = useState(false)
  const [notes, setNotes] = useState(false)
  const [sourceError, setSourceError] = useState(false)
  const scroll = useRef(null)
  const navigation = useRef(null)
  const tasks = taskRows(scene)
  // 批注编号对齐 Orca：按记录顺序全局编号，板面角标与面板卡片同号。
  const numbered = annotations.map((item, i) => ({ ...item, number: i + 1 }))
  const annotationNumbers = numbered.reduce((map, item) => {
    map[item.object] = [...(map[item.object] || []), item.number]
    return map
  }, {})
  const move = (id) => {
    navigation.current = id
    setActive(id)
    document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }
  const toggleSession = (open) => {
    navigation.current = active
    setSession(open)
    requestAnimationFrame(() => document.getElementById(active)?.scrollIntoView({ block: 'start' }))
  }
  // 对象级动作复用 Orca 原生发送弹窗（与浏览器批注同一链路）：
  // 携带一句话指令 + 对象上下文，由用户在原生弹窗确认目标会话后发送。
  const sendRequest = (text, kind) => {
    toggleSession(true)
    setSentRequest({ kind, text })
    setNotice('')
  }
  const newPlan = () => {
    toggleSession(true)
    setNotice('新建计划调用已登记自动化的手动运行，打开新会话并携带 BW 提示 · 演示示意')
  }
  const openComposer = (target) => {
    setAnnotateTarget(target)
    setPanelOpen(true)
    setNotice('')
  }
  const toggleAnnotating = () => {
    const next = !annotating
    setAnnotating(next)
    setAnnotateTarget(null)
    setPanelOpen(next)
    setNotice(
      next ? '批注模式：点击目标卡、验收标准或 Issue 行记录评审意见 · Esc 退出' : ''
    )
  }
  useEffect(() => {
    if (!annotating) {
      return
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setAnnotating(false)
        setPanelOpen(false)
        setAnnotateTarget(null)
        setNotice('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [annotating])
  const onScrollClickCapture = (event) => {
    if (!annotating) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (event.target.closest('#minutes')) {
      return
    }
    const element = event.target.closest('[data-annotate]')
    if (element) {
      openComposer(element.dataset.annotate)
    }
  }
  const update = (id, field, value) => {
    setGoals((current) => current.map((g) => (g.goalId === id ? { ...g, [field]: value } : g)))
    setNotice('本页演示修改 · 刷新后恢复原始材料')
  }
  const updateCommit = (id, next) => {
    setMetricCommits((current) => ({ ...current, [id]: next }))
    setNotice('本页演示修改 · 刷新后恢复原始材料')
  }
  const switchScene = (value) => {
    setScene(value)
    setNotice('')
    setPrHandoff(false)
    setHandoff(null)
    setSentRequest(null)
    setAnnotateTarget(null)
    setAnnotating(false)
    setPanelOpen(false)
  }
  const archiveStatus =
    { MERGED: '已合入', OPEN: '待合入', CLOSED: '已关闭' }[snapshot.archive.state] || '状态未知'
  const reset = () => window.location.reload()

  return (
    <div className={`g3-app ${compact ? 'constrained' : ''} ${annotating ? 'annotating' : ''}`}>
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
            <strong>界面边界</strong>：左侧导航属于 G2；计划助手在左侧完整复用 Orca
            原生会话——整栏（含顶部标签栏与会话标题）都是原生，候选不绘制 BW
            会话头，「计划助手」是这个原生会话的产品称呼。会话收折沿用已落地壳行为：BW
            板面页头带图标的「收起会话 / 展开会话」按钮，页头不再另设助手图标入口，
            原生会话本身不带关闭 ×。对象级动作（拆解、整理纪要、基于纪要调整）复用 Orca
            原生发送弹窗——与浏览器批注「发送给 Agent」同一条链路，用户在弹窗中确认目标会话后发送，
            不恢复已退役的贴草稿通道；动作同时自动展开会话栏。分支名弱化展示，
            「配置自动化」打开原生自动化编辑器，自动化绑定固定工作树，与版本选择解耦。
          </p>
          <p>
            <strong>数据来源</strong>：上版回顾只回显延期遗留 Issue（编号 +
            标题，点击跳转）与会议遗留事项；v0.6 会议遗留未单独记录，完整进展 /
            交付材料留在验收屏，延期引用来自人工验收记录中明确的遗留项，不按 open 状态自动推断。
            Issue 行显示 Bug / Feature 分类，按 2026-10-21
            补采进快照的真实标签推导（#387 / #384 / #372 为 bug）；无 Bug /
            缺陷标签默认按 Feature 显示。指标目录为 v0.5 快照样例数据；v0.7 快照
            metricTargets 全为空，各卡从「添加指标承诺（可选）」开始，当前读数为 —
            时目标值标草案。
            <a
              href="https://github.com/forcegravity1989/builder-workbench/blob/e43528cae57424bb0973c99c6e3c03af075c1198/.bw/planning/v0.6/acceptance.json"
              target="_blank"
              rel="noreferrer"
            >
              完整验收材料 ↗
            </a>
          </p>
          <p>
            <strong>纪要与批注</strong>：纪要示例源自 #385 边界讨论，仅演示；固定两块——共识、
            遗留（逐条闭环状态，闭环 = 版本计划已按该条修改，由人标记）。批注窗布局对齐 Orca
            原生批注参考：页头「批注模式」（气泡 + 加号图标，vendor 冻结、由两枚图标组合）进入 →
            右侧打开「板面批注（N）」面板 → 点击板面元素（目标句、验收标准、指标承诺、Issue
            行或整卡）写入输入框，或「添加板面级批注」→ 复制或经原生发送弹窗发给计划助手；
            板面编号角标与面板卡片同号。纪要区不参与批注。BW
            板面元素的捕获层（元素映射为业务对象引用）留实现设计。会议 ID 现阶段由 Builder
            提供，不提供时仅凭在线批注也可生成；群组 / WeLink 自动获取待用户组旅程设计。
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
          {session ? (
            <div className="g3-native-workspace">
              <Icon name="agent" size={28} />
              <h2>Orca 原生会话工作区</h2>
              <p>顶部标签栏、会话标题与全部控件均为 Orca 原生</p>
              <small>这里只示意会话位置，不另设计聊天界面；「计划助手」是这个原生会话的产品称呼</small>
            </div>
          ) : (
            <div className="g3-session-rail-text" aria-hidden="true">
              计划会话已收折
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
            <div className="g3-header-actions">
              <button
                className="g3-session-chip"
                aria-expanded={session}
                aria-label={session ? '收折会话栏' : '展开会话栏'}
                title={session ? '收折会话栏' : '展开会话栏'}
                onClick={() => toggleSession(!session)}
              >
                <Icon name="chat" size={13} /> {session ? '收起会话' : '展开会话'}
              </button>
              <span className="g3-branch" title="固定工作树分支">
                <Icon name="branch" size={13} /> bw/week-plan
              </span>
              <button
                className="g3-text-button"
                title="打开原生自动化编辑器"
                onClick={() =>
                  setNotice('配置自动化打开 Orca 原生自动化编辑器 · 一次性配置（演示示意）')
                }
              >
                <Icon name="automation" size={13} /> 配置自动化
              </button>
              <IconButton
                name="annotate-mode"
                label="批注模式：点击板面元素记录评审意见"
                aria-pressed={annotating}
                className={annotating ? 'g3-mode-on' : ''}
                onClick={toggleAnnotating}
              />
            </div>
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
          {annotating && (
            <div className="g3-annotate-banner" role="status">
              批注模式：点击目标句、验收标准、指标承诺或 Issue 行记录评审意见 · Esc
              或再次点击「批注模式」退出
            </div>
          )}
          <div
            className="g3-scroll"
            ref={scroll}
            onClickCapture={onScrollClickCapture}
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
                  <div className="g3-carryover-row">
                    <span>延期遗留</span>
                    <div className="g3-carryover-issues">
                      {leftoverIssues.length ? (
                        leftoverIssues.map((issue) => (
                          <a key={issue.number} href={issue.url} target="_blank" rel="noreferrer">
                            <span className="g3-id">#{issue.number}</span>
                            {issue.title}
                          </a>
                        ))
                      ) : (
                        <span className="g3-muted">上版无延期 Issue</span>
                      )}
                    </div>
                  </div>
                  <div className="g3-carryover-row">
                    <span>会议遗留</span>
                    <div className="g3-carryover-issues">
                      {meetingDirectives.length ? (
                        meetingDirectives.map((item, i) => (
                          <div key={i}>
                            <span className="g3-id">M{i + 1}</span>
                            {item.text || item}
                          </div>
                        ))
                      ) : (
                        <span className="g3-muted">上版会议未单独记录</span>
                      )}
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
                <span className="g3-title-actions">
                  {scene !== 'none' && (
                    <button
                      className="g3-text-button"
                      title="新建会话，配置指标"
                      onClick={() =>
                        setNotice('配置指标在固定指标工作区新建原生会话 · 演示示意')
                      }
                    >
                      <Icon name="annotate-mode" size={13} /> 配置指标
                    </button>
                  )}
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
                </span>
              </div>
              {scene === 'none' ? (
                <div className="g3-empty-board">
                  <p>v0.7 计划尚未建立。</p>
                  <button onClick={newPlan}>与计划助手新建计划</button>
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
                        commit={metricCommits[goal.goalId] || null}
                        onCommit={(next) => updateCommit(goal.goalId, next)}
                        onCollect={() =>
                          setNotice('指标采集沿用总览同一能力，读取主干基线 · 演示不真实采集')
                        }
                        sendRequest={sendRequest}
                        annotationNumbers={annotationNumbers}
                        onOpenPanel={() => {
                          setPanelOpen(true)
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
                    name="agent"
                    label="让计划助手整理纪要（可提供会议 ID）"
                    onClick={() =>
                      sendRequest(
                        '把在线批注与会议转写稿整理为会议纪要，按共识 / 遗留两块输出',
                        '整理纪要请求'
                      )
                    }
                  />
                </span>
              </div>
              <p className="g3-minutes-guidance g3-annotation">
                纪要由计划助手从在线批注与可选的会议转写稿总结，固定两块：共识、遗留（逐条闭环状态，
                闭环 = 版本计划已按该条修改，由人标记），经人工确认后生效；随后与助手基于纪要调整上方目标。
                批注从页头「批注模式」进入；会议 ID 现阶段由 Builder
                提供，不提供时仅凭批注也可生成；群组 / WeLink 自动获取是后续演进。
              </p>
              {scene === 'full' ? (
                <MinutesCard minutes={minutes} sendRequest={sendRequest}
                  update={(patch) => {
                    setMinutes({ ...minutes, ...patch })
                    setNotice('本页演示修改 · 刷新后恢复原始材料')
                  }}
                />
              ) : (
                <p className="g3-empty">
                  会后由计划助手基于在线批注与可选转写稿生成；批注从页头「批注模式」进入，
                  点击目标句、验收标准或 Issue 行等板面元素记录。
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
            ) : sentRequest ? (
              <div className="g3-footer-handoff">
                <span>
                  {sentRequest.kind}已通过 Orca 原生发送弹窗递交计划助手：「{sentRequest.text}
                  」· 用户在弹窗确认目标会话后发送，演示不真正发送。
                </span>
                <IconButton
                  name="close"
                  label="收起发送说明"
                  onClick={() => setSentRequest(null)}
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
      <AnnotationPanel
        open={panelOpen}
        target={annotateTarget}
        annotations={numbered}
        onClose={() => {
          setPanelOpen(false)
          setAnnotateTarget(null)
        }}
        onRecord={(text) => {
          setAnnotations((current) => [
            ...current,
            { id: `${Date.now()}-${current.length}`, object: annotateTarget, text }
          ])
          setAnnotateTarget(null)
        }}
        onRemove={(id) =>
          setAnnotations((current) => current.filter((item) => item.id !== id))
        }
        onBoardLevel={() => setAnnotateTarget('板面级')}
        onSend={() => {
          setAnnotateTarget(null)
          sendRequest('以下是评审会在线批注，作为会议纪要输入整理', '批注')
        }}
      />
    </div>
  )
}
createRoot(document.getElementById('root')).render(React.createElement(App))
