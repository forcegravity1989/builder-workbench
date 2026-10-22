const { React, createRoot, useState, useRef, useEffect } = window.BWPrototypeDependencies
import {
  snapshot,
  stages,
  scenes,
  initialMinutes,
  leftoverIssues,
  meetingDirectives,
  priorLiveOpen,
  taskRows,
  g2Url
} from './g3-model.js'
import {
  Icon,
  IconButton,
  ActionButton,
  GoalRow,
  MinutesCard,
  MinutesSkeleton,
  SendPopover,
  AnnotationPanel,
  AnnotationPopover
} from './g3-components.jsx'

function App() {
  const [goals, setGoals] = useState(() => structuredClone(snapshot.plan.goals))
  const [scene, setScene] = useState('full')
  const [minutes, setMinutes] = useState(() => structuredClone(initialMinutes))
  const [metricCommits, setMetricCommits] = useState({})
  const [annotations, setAnnotations] = useState([])
  const [annotating, setAnnotating] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  // 对象批注小窗：{ id, target, rect }，贴着被点元素弹出；记录不再进面板。
  const [popover, setPopover] = useState(null)
  const [expanded, setExpanded] = useState([])
  const [editingGoal, setEditingGoal] = useState(null)
  const [active, setActive] = useState('context')
  const [session, setSession] = useState(false)
  const [notice, setNotice] = useState('')
  const [handoff, setHandoff] = useState(null)
  // 发送弹窗：{ kind, text, rect }；对象级动作先弹「指令预览 + 选择会话」，
  // 人选定目标后才算发送（对齐 Orca 原生发送菜单链路）。
  const [sendPop, setSendPop] = useState(null)
  const [sentRequest, setSentRequest] = useState(null)
  const [prHandoff, setPrHandoff] = useState(false)
  const [dark, setDark] = useState(false)
  const [compact, setCompact] = useState(false)
  const [notes, setNotes] = useState(false)
  const [sourceError, setSourceError] = useState(false)
  // 上版回顾「延期遗留」演示态：marked = 验收已标 carry；unmarked = 未标记 +
  // 实时读回（v0.6 真实状态）；loading / error = 实时读回进行中 / 失败。
  const [carryDemo, setCarryDemo] = useState('unmarked')
  const scroll = useRef(null)
  const navigation = useRef(null)
  const tasks = taskRows(scene)
  // 删除目标后其 Issue 引用一并移出计划，侧栏计数现算，不留旧数。
  const visibleTaskCount = tasks.filter((t) => goals.some((g) => g.goalId === t.goalId)).length
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
  // 对象级动作复用 Orca 原生发送弹窗（与浏览器批注同一链路）：点击动作先弹出
  // 「指令预览 + 发送至 + 新建智能体」弹窗，由人确认目标会话后发送；
  // 发送成功给板面瞬态反馈，动作同时自动展开会话栏。
  const sendRequest = (text, kind, rect) => {
    setSendPop({ text, kind, rect })
    setSentRequest(null)
    setNotice('')
  }
  const confirmSend = (target) => {
    const kind = sendPop?.kind || '指令'
    setSendPop(null)
    toggleSession(true)
    setSentRequest({
      kind,
      target: target.launched ? `新建 ${target.name} 会话` : target.name
    })
  }
  const newPlan = () => {
    toggleSession(true)
    setNotice('新建计划调用已登记自动化的手动运行，打开新会话并携带 BW 提示 · 演示示意')
  }
  const openPopover = (target, rect) => {
    setPopover({
      id: `${target}-${Date.now()}`,
      target,
      rect: { left: rect.left, top: rect.top, bottom: rect.bottom }
    })
    setPanelOpen(true)
    setNotice('')
  }
  const toggleAnnotating = () => {
    const next = !annotating
    setAnnotating(next)
    setPopover(null)
    setPanelOpen(next)
    setNotice(next ? '批注模式：点击板面元素，在对象旁的小窗记录评审意见 · Esc 退出' : '')
  }
  useEffect(() => {
    if (!annotating) {
      return
    }
    const onKey = (event) => {
      if (event.key !== 'Escape') {
        return
      }
      // Esc 先关就近小窗，再退出批注模式并关闭面板。
      if (popover) {
        setPopover(null)
        return
      }
      setAnnotating(false)
      setPanelOpen(false)
      setNotice('')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [annotating, popover])
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
      openPopover(element.dataset.annotate, element.getBoundingClientRect())
    } else {
      setPopover(null)
    }
  }
  const removeGoal = (goalId) => {
    const removedTasks = tasks.filter((t) => t.goalId === goalId).length
    setGoals((current) => current.filter((g) => g.goalId !== goalId))
    setExpanded((current) => current.filter((id) => id !== goalId))
    setEditingGoal((current) => (current === goalId ? null : current))
    setMetricCommits((current) => {
      const next = { ...current }
      delete next[goalId]
      return next
    })
    // 批注对象随目标一并移除，编号重排由 numbered 现算。
    setAnnotations((current) => current.filter((item) => !item.object.startsWith(`${goalId} `)))
    if (popover && popover.target.startsWith(`${goalId} `)) {
      setPopover(null)
    }
    setNotice(
      `已删除目标 ${goalId} · 其 ${removedTasks} 条关联 Issue 引用与相关批注一并移出本版计划（演示仅内存，「重置」可恢复）`
    )
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
    setSendPop(null)
    setSentRequest(null)
    setPopover(null)
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
            原生会话本身不带关闭 ×。对象级动作（拆解 Issue、整理纪要、批注发送）是 图标 +
            短动词文字按钮（2026-10-22 真机反馈轮：纯小图标隐蔽），点击弹出发送弹窗——
            与浏览器批注「发送给 Agent」同一条 Orca 原生链路：顶部指令预览（BW
            包装层新增，原生菜单不显示待发送文本）、「发送至」运行中会话列表（不可用行显示原因）、
            「新建智能体」快捷启动（会话就绪后自动递交指令），人确认目标后发送；发送成功板面底栏给
            「已发送至 ××× · 在会话栏查看进展」瞬态反馈，动作同时自动展开会话栏。
            不恢复已退役的贴草稿通道。分支名弱化展示，
            「配置自动化」打开原生自动化编辑器，自动化绑定固定工作树，与版本选择解耦。
            目标卡展开后可整卡删除：卡片头 × 图标触发就近二次确认（确认删除 /
            取消，不弹窗），删除即把该目标的 Issue 引用与相关批注一并移出板面；
            生产语义为计划文档编辑，经材料读写服务保存。
          </p>
          <p>
            <strong>数据来源</strong>：上版回顾回显延期遗留 Issue（编号 +
            标题，点击跳转）与会议遗留事项；完整进展 / 交付材料留在验收屏。延期遗留只认验收屏人工
            carry 标记，不从 open 状态推断、不解析自由文本；
            <strong>
              验收未记录标记时显示 「上版验收未记录 Issue
              延期标记」（Unknown，不断言「无延期」——四铁律：没数据不是绿灯）
            </strong>
            ， 并给一行实时读回参考：独立读回上版快照 Issue 的当前 open 状态（异步、可重试，
            失败显示未知），只陈述事实、不冒充人工确认的延期结论。v0.6 验收实际未标 carry（快照中 4
            个 Issue 仍 open），即「未标记 + 实时读回」态。 Issue 行显示 Bug / Feature 分类，按
            2026-10-21 补采进快照的真实标签推导（#387 / #384 / #372 为 bug）；无 Bug /
            缺陷标签默认按 Feature 显示。指标目录为 v0.5 快照样例数据；v0.7 快照 metricTargets
            全为空，各卡从「添加指标承诺（可选）」开始，当前读数为 — 时目标值标草案。
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
            遗留（逐条闭环状态，闭环 = 版本计划已按该条修改，由人标记）。
            <strong>纪要未生成时显示同结构 骨架卡</strong>（2026-10-22 真机反馈轮）：「未生成」徽章
            + 两块占位 + 「整理纪要」动作在卡上， 界面结构稳定可预见。板面批注编号角标用强调色底 +
            白字（显式高对比配色，不依赖 foreground / background
            变量对——修复真机黑底黑字不可见）。批注交互对齐 Orca 原生元素批注：页头「批注模式」（气泡
            + 加号图标，vendor 冻结、由两枚图标组合）进入 →
            点击板面元素（目标句、验收标准、指标承诺、Issue 行或整卡），元素旁弹出「对象批注」
            小窗（对象名标题、textarea、取消 / 添加，Ctrl+Enter 快捷添加；右上角 ×
            只关闭小窗、不动已记录批注）→ 右侧「板面批注（N）」面板承担记录列表与卡片级管理
            （每卡带笔形编辑 / × 删除入口，编辑为卡片内行内编辑；高度随内容、列表限高内滚动，
            不覆盖板面），「添加板面级批注」复用同一个小窗；复制或经原生发送弹窗发给计划助手。 与
            Orca 弹窗的差异：BW 小窗不带意图分段与发送行——批注是评审会速记、
            整批作为纪要输入，发送统一走面板底部经原生发送弹窗。板面编号角标与面板卡片同号。
            纪要区不参与批注。BW 板面元素的捕获层（元素映射为业务对象引用）留实现设计。会议 ID
            现阶段由 Builder 提供，不提供时仅凭在线批注也可生成；群组 / WeLink
            自动获取待用户组旅程设计。
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
          <p>
            <strong>延期遗留演示态</strong>（2026-10-22 真机反馈轮）：
            <button onClick={() => setCarryDemo('marked')}>验收已标 carry</button>
            <button onClick={() => setCarryDemo('unmarked')}>未标记 + 实时读回（v0.6 真实）</button>
            <button onClick={() => setCarryDemo('loading')}>读回加载中</button>
            <button onClick={() => setCarryDemo('error')}>读回失败</button>
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
            任务 <span>{visibleTaskCount}</span>
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
              <small>
                这里只示意会话位置，不另设计聊天界面；「计划助手」是这个原生会话的产品称呼
              </small>
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
              批注模式：点击目标句、验收标准、指标承诺或 Issue 行，在对象旁的小窗记录评审意见 · Esc
              先关小窗，再按一次退出批注模式
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
                      {carryDemo === 'marked' ? (
                        leftoverIssues.map((issue) => (
                          <a key={issue.number} href={issue.url} target="_blank" rel="noreferrer">
                            <span className="g3-id">#{issue.number}</span>
                            {issue.title}
                          </a>
                        ))
                      ) : carryDemo === 'unmarked' ? (
                        <>
                          <span className="g3-muted">上版验收未记录 Issue 延期标记</span>
                          <div className="g3-carryover-live">
                            <span className="g3-live-tag">
                              <Icon name="refresh" size={11} /> 实时读回
                            </span>
                            <span>
                              上版 <strong>{priorLiveOpen.length}</strong> 个 Issue 仍 open
                            </span>
                            {priorLiveOpen.map((issue) => (
                              <a
                                key={issue.number}
                                href={`https://github.com/forcegravity1989/builder-workbench/issues/${issue.number}`}
                                target="_blank"
                                rel="noreferrer"
                                title={issue.title}
                              >
                                <span className="g3-id">#{issue.number}</span>
                              </a>
                            ))}
                            <small>读回为 Issue 当前状态，未经人确认延期；确认请在验收屏标记</small>
                          </div>
                        </>
                      ) : carryDemo === 'loading' ? (
                        <>
                          <span className="g3-muted">上版验收未记录 Issue 延期标记</span>
                          <div className="g3-carryover-live">
                            <span className="g3-live-tag">
                              <Icon name="refresh" size={11} /> 实时读回
                            </span>
                            <span className="g3-muted" role="status">
                              正在读回上版 Issue 当前状态…
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="g3-muted">上版验收未记录 Issue 延期标记</span>
                          <div className="g3-carryover-live">
                            <span className="g3-live-tag">
                              <Icon name="refresh" size={11} /> 实时读回
                            </span>
                            <span className="g3-muted">读回失败，当前状态未知</span>
                            <button onClick={() => setCarryDemo('unmarked')}>重试</button>
                          </div>
                        </>
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
                      onClick={() => setNotice('配置指标在固定指标工作区新建原生会话 · 演示示意')}
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
                        onDelete={removeGoal}
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
                          document
                            .getElementById(`goal-${id}`)
                            ?.scrollIntoView({ block: 'nearest' })
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
                {scene === 'full' && (
                  <span className="g3-title-actions">
                    <ActionButton
                      onClick={(e) =>
                        sendRequest(
                          '把在线批注与会议转写稿整理为会议纪要，按共识 / 遗留两块输出',
                          '整理纪要请求',
                          e.currentTarget.getBoundingClientRect()
                        )
                      }
                    >
                      整理纪要
                    </ActionButton>
                  </span>
                )}
              </div>
              {scene === 'full' && (
                <p className="g3-minutes-guidance g3-annotation">
                  纪要由计划助手从在线批注与可选的会议转写稿总结，固定两块：共识、遗留（逐条闭环状态，
                  闭环 = 版本计划已按该条修改，由人标记），经人工确认后生效；纪要确认后由计划助手的
                  Skill SOP 自然引导人跟着调整目标并确认，屏上不设独立「调整目标」入口（2026-10-22
                  用户决定）。 批注从页头「批注模式」进入；会议 ID 现阶段由 Builder
                  提供，不提供时仅凭批注也可生成；群组 / WeLink 自动获取是后续演进。
                </p>
              )}
              {scene === 'full' ? (
                <MinutesCard
                  minutes={minutes}
                  update={(patch) => {
                    setMinutes({ ...minutes, ...patch })
                    setNotice('本页演示修改 · 刷新后恢复原始材料')
                  }}
                />
              ) : (
                <MinutesSkeleton sendRequest={sendRequest} />
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
                  {sentRequest.kind}已发送至「{sentRequest.target}」·
                  在会话栏查看进展（演示不真正发送）。
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
        annotations={numbered}
        onClose={() => {
          setPanelOpen(false)
          setPopover(null)
        }}
        onUpdate={(id, text) =>
          setAnnotations((current) =>
            current.map((item) => (item.id === id ? { ...item, text } : item))
          )
        }
        onRemove={(id) => setAnnotations((current) => current.filter((item) => item.id !== id))}
        onBoardLevel={(event) => openPopover('板面级', event.currentTarget.getBoundingClientRect())}
        onSend={(rect) => {
          setPopover(null)
          sendRequest('以下是评审会在线批注，作为会议纪要输入整理', '批注', rect)
        }}
      />
      {sendPop && (
        <SendPopover
          request={sendPop}
          rect={sendPop.rect}
          onPick={confirmSend}
          onClose={() => setSendPop(null)}
        />
      )}
      {popover && (
        <AnnotationPopover
          key={popover.id}
          target={popover.target}
          rect={popover.rect}
          onSave={(text) => {
            setAnnotations((current) => [
              ...current,
              { id: `${Date.now()}-${current.length}`, object: popover.target, text }
            ])
            setPopover(null)
          }}
          onCancel={() => setPopover(null)}
        />
      )}
    </div>
  )
}
createRoot(document.getElementById('root')).render(React.createElement(App))
