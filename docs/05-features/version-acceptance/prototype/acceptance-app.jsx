const { React, createRoot, useState, useRef, useEffect } = window.BWPrototypeDependencies
import {
  snapshot,
  stages,
  scenes,
  PIPELINES,
  LATEST_PACKAGE,
  CANDIDATE,
  REPORT,
  sceneVerdicts,
  sceneIssueNotes,
  sceneCarry,
  sceneLatest,
  nextSteps,
  sceneMinutes,
  sceneArchive,
  EMPTY_MINUTES,
  releaseInfo,
  taskRows,
  g2Url
} from './acceptance-model.js'
import {
  Icon,
  IconButton,
  Field,
  MinutesCard,
  AnnotationPanel,
  AnnotationPopover
} from '../../version-planning/prototype/g3-components.jsx'

function Lines({ text, empty = '待明确' }) {
  return (
    <div className="g3-lines">
      {(text || empty)
        .split('\n')
        .filter((line) => line.trim())
        .map((line, i) => (
          <p key={i}>{line}</p>
        ))}
    </div>
  )
}

// 行尾人判:达成/不达成互斥,再点取消回未标;演示进度不进材料。
function Verdict({ value, onSet }) {
  return (
    <span className="acc-verdict" onClick={(e) => e.stopPropagation()}>
      <button
        className={`acc-verdict-btn met${value === '达成' ? ' on' : ''}`}
        aria-pressed={value === '达成'}
        title="人对着实物核对后标记:达成"
        onClick={() => onSet(value === '达成' ? null : '达成')}
      >
        达成
      </button>
      <button
        className={`acc-verdict-btn miss${value === '不达成' ? ' on' : ''}`}
        aria-pressed={value === '不达成'}
        title="人对着实物核对后标记:不达成(原因写进展,安排写下一步)"
        onClick={() => onSet(value === '不达成' ? null : '不达成')}
      >
        不达成
      </button>
    </span>
  )
}

function AcceptanceRow({
  goal,
  tasks,
  expanded,
  toggle,
  verdict,
  onVerdict,
  notes,
  onNote,
  carry,
  onCarry,
  goalNumbers,
  taskNumbers,
  onOpenPanel,
  nextStep,
  onNext,
  onOpenReport,
  reportReady
}) {
  const goalTarget = `${goal.goalId} 目标`
  return (
    <article className={`g3-goal ${expanded ? 'open' : ''}`} id={`acc-${goal.goalId}`}>
      <div className="g3-goal-head" data-annotate={goalTarget}>
        <button
          className="g3-goal-toggle"
          onClick={toggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? '收起' : '展开'} ${goal.goalId}`}
        >
          <Icon name={expanded ? 'down' : 'right'} size={14} />
          <span className="g3-goal-id">{goal.goalId}</span>
          <strong>{goal.title || '待明确目标'}</strong>
        </button>
        {goalNumbers.length > 0 && (
          <button
            className="g3-annot-count"
            aria-label={`${goalTarget} 的批注 ${goalNumbers.length} 条`}
            title="打开板面批注窗"
            onClick={onOpenPanel}
          >
            <Icon name="annotate" size={12} />
            {goalNumbers.join(',')}
          </button>
        )}
        <span className="g3-goal-count">{tasks.length} Issue</span>
        <Verdict value={verdict} onSet={onVerdict} />
      </div>
      {!expanded && (
        <div className="g3-goal-meta">
          <span>{goal.owner || '负责人待明确'}</span>
        </div>
      )}
      {expanded && (
        <div className="g3-goal-body">
          <div className="g3-goal-meta">
            <span>{goal.owner || '负责人待明确'}</span>
          </div>
          <div className="g3-acceptance">
            <h3>
              验收标准 <small className="g3-muted">只读自计划</small>
            </h3>
            <Lines text={goal.acceptance} />
          </div>
          <div className="g3-task-head">
            <h3>
              关联 Issue <span>{tasks.length}</span>
            </h3>
            <button
              className="acc-report-link"
              disabled={!reportReady}
              title={
                reportReady
                  ? '在内置 Orca 浏览器打开验收证据报告对应章节'
                  : '报告未生成;先在会话中让验收助手生成'
              }
              onClick={onOpenReport}
            >
              证据报告 §{goal.goalId}
              <Icon name="arrow" size={12} />
            </button>
          </div>
          <div className="g3-tasks">
            {tasks.length ? (
              tasks.map((task) => {
                const taskTarget = `${goal.goalId} · #${task.number}`
                const numbers = taskNumbers[taskTarget] || []
                return (
                  <div className="g3-task" key={task.number} data-annotate={taskTarget}>
                    <a
                      href={
                        task.url ||
                        `https://github.com/forcegravity1989/builder-workbench/issues/${task.number}`
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="g3-id">#{task.number}</span>
                      {task.title?.replace(/^【.*?】/, '') || '标题未读到'}
                    </a>
                    <span className="g3-task-state">
                      {task.state === 'CLOSED' ? '已关闭' : task.state === 'OPEN' ? '开放' : '状态未知'}
                    </span>
                    {numbers.length > 0 && (
                      <button
                        className="g3-annot-count"
                        aria-label={`${taskTarget} 的批注 ${numbers.length} 条`}
                        title="打开板面批注窗"
                        onClick={onOpenPanel}
                      >
                        <Icon name="annotate" size={12} />
                        {numbers.join(',')}
                      </button>
                    )}
                    {task.state !== 'CLOSED' && (
                      <>
                        <input
                          className="acc-note-input"
                          aria-label={`#${task.number} 备注`}
                          value={notes[task.number] ?? ''}
                          placeholder="备注(遗留原因写这里)"
                          onChange={(e) => onNote(task.number, e.target.value)}
                        />
                        <button
                          className={`acc-carry${carry[task.number] ? ' on' : ''}`}
                          aria-pressed={Boolean(carry[task.number])}
                          title="人工判断:验收后是否遗留(下版计划屏「延期遗留」回显)"
                          onClick={() => onCarry(task.number)}
                        >
                          遗留
                        </button>
                      </>
                    )}
                    {task.state === 'CLOSED' && notes[task.number] && (
                      <span className="acc-note-readonly" title="已关闭 Issue:已存备注只读展示,不再编辑">
                        {notes[task.number]}
                      </span>
                    )}
                  </div>
                )
              })
            ) : (
              <p className="g3-empty">该目标暂无关联 Issue。</p>
            )}
          </div>
          {verdict === '不达成' && (
            <div className="acc-nextstep">
              <Field
                label={`${goal.goalId} 下一步`}
                value={nextStep}
                rows={2}
                onChange={onNext}
                placeholder="本版补齐、带入下版或停止,并说明安排"
              />
            </div>
          )}
        </div>
      )}
    </article>
  )
}

function ReleaseModal({ verdictSummary, onClose, onConfirm }) {
  return (
    <div className="acc-modal-backdrop" onClick={onClose}>
      <section
        className="acc-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`发布 ${releaseInfo.version}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>发布 {releaseInfo.version}</h2>
          <IconButton name="close" label="关闭" onClick={onClose} />
        </header>
        <p className="acc-modal-lead">发布预检:</p>
        <ul className="acc-modal-list">
          <li>版本号:{releaseInfo.version}(发布前展示,由你确认)</li>
          <li>
            发布提交与最后一轮验收的包一致:<code>{releaseInfo.commit}</code>
          </li>
          <li>目标状态:{verdictSummary} —— 不达成与未标不阻断发布,由你知情决定</li>
          <li>版本说明:已按规范备好,只写用户拿到的变化,不列未完成事项</li>
        </ul>
        <p className="g3-muted">
          发布在会话中执行、经你明确授权;界面只发起请求并读回结果(tag、时间、资产)。
        </p>
        <footer>
          <button className="acc-btn primary" autoFocus onClick={onConfirm}>
            发起发布请求
          </button>
          <button className="acc-btn" onClick={onClose}>
            取消
          </button>
        </footer>
      </section>
    </div>
  )
}

function App() {
  const [scene, setScene] = useState('wrap')
  const [verdicts, setVerdicts] = useState({ ...sceneVerdicts.wrap })
  const [issueNotes, setIssueNotes] = useState({ ...sceneIssueNotes.wrap })
  const [carry, setCarry] = useState({ ...sceneCarry.wrap })
  const [nexts, setNexts] = useState({ G3: nextSteps.G3 })
  const [minutes, setMinutes] = useState(() =>
    sceneMinutes.wrap ? structuredClone(sceneMinutes.wrap) : null
  )
  const [archive, setArchive] = useState(sceneArchive.wrap)
  const [released, setReleased] = useState(false)
  const [releaseModal, setReleaseModal] = useState(false)
  const [errorModal, setErrorModal] = useState(false)
  const [expanded, setExpanded] = useState([])
  const [active, setActive] = useState('prepare')
  const [session, setSession] = useState(true)
  const [notice, setNotice] = useState('')
  const [sentRequest, setSentRequest] = useState(null)
  const [prHandoff, setPrHandoff] = useState(false)
  const [releaseHandoff, setReleaseHandoff] = useState(false)
  const [dark, setDark] = useState(false)
  const [compact, setCompact] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [deployed, setDeployed] = useState(true)
  // 出包区块可收缩,默认收起为一行最新包摘要(会中不占视野)。
  const [pkgOpen, setPkgOpen] = useState(false)
  // 批注机制与计划屏同源(同一组件族与交互):模式开关、对象小窗、板面批注窗。
  const [annotations, setAnnotations] = useState([])
  const [annotating, setAnnotating] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [popover, setPopover] = useState(null)
  const scroll = useRef(null)
  const navigation = useRef(null)
  const goals = snapshot.plan.goals
  const tasks = taskRows()
  const latest = sceneLatest[scene] ?? null
  const report = scene === 'meeting' || scene === 'wrap' ? REPORT : null
  const judged = goals.filter((g) => verdicts[g.goalId]).length
  const verdictSummary = `达成 ${goals.filter((g) => verdicts[g.goalId] === '达成').length} · 不达成 ${
    goals.filter((g) => verdicts[g.goalId] === '不达成').length
  } · 未标 ${goals.length - judged}`
  const archiveStatus = archive
    ? { MERGED: '已合入', OPEN: '待合入', CLOSED: '已关闭' }[archive.state] || '状态未知'
    : null
  // 批注编号对齐计划屏:按记录顺序全局编号,板面角标与面板卡片同号。
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
  // 对象级动作复用 Orca 原生发送弹窗(与计划屏同一链路)。
  const sendRequest = (text, kind) => {
    toggleSession(true)
    setSentRequest({ kind, text })
    setNotice('')
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
    setNotice(next ? '批注模式:点击板面元素,在对象旁的小窗记录意见 · Esc 退出' : '')
  }
  useEffect(() => {
    if (!annotating) {
      return
    }
    const onKey = (event) => {
      if (event.key !== 'Escape') {
        return
      }
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
  // 弹窗 Esc 关闭(与批注小窗同惯例:浮层可键盘退出)。
  useEffect(() => {
    if (!releaseModal && !errorModal) {
      return
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setReleaseModal(false)
        setErrorModal(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [releaseModal, errorModal])
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
  const switchScene = (value) => {
    setScene(value)
    setVerdicts({ ...sceneVerdicts[value] })
    setIssueNotes({ ...sceneIssueNotes[value] })
    setCarry({ ...sceneCarry[value] })
    setNexts(value === 'wrap' ? { G3: nextSteps.G3 } : {})
    setMinutes(sceneMinutes[value] ? structuredClone(sceneMinutes[value]) : null)
    setArchive(sceneArchive[value])
    setReleased(false)
    setReleaseModal(false)
    setReleaseHandoff(false)
    setDeployed(value === 'meeting' || value === 'wrap')
    setPrHandoff(false)
    setSentRequest(null)
    setErrorModal(false)
    setPopover(null)
    setAnnotating(false)
    setPanelOpen(false)
    setNotice('')
  }
  // 空板唯一动作:检测计划归档 PR 合入 → 通过则拉取计划、展开四步板面;未合入报错、保持空板。
  const startAcceptance = () => {
    switchScene('started')
    toggleSession(true)
    setNotice('检测通过:计划归档 PR #386 已合入,已拉取 v0.7 计划并新建验收会话 · 演示示意')
  }
  const openService = () => {
    toggleSession(true)
    setNotice('已在内置 Orca 浏览器打开 http://127.0.0.1:4173 · 衔接示意')
  }
  return (
    <div className={`g3-app ${compact ? 'constrained' : ''} ${annotating ? 'annotating' : ''}`}>
      <div className="g3-demo-bar">
        <strong>验收 v10 候选</strong>
        <span>四步会议屏 · v0.7 真实计划材料 · 编辑仅在本页演示</span>
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
        <button onClick={() => window.location.reload()}>重置</button>
        <button aria-expanded={showNotes} onClick={() => setShowNotes(!showNotes)}>
          设计说明
        </button>
      </div>
      {showNotes && (
        <div className="g3-design-notes">
          <p>
            <strong>定位与边界</strong>:验收屏为周五验收会议服务,四步——验收准备 →
            Showcase → 会议纪要 → 归档 PR 及发版本。个人对需求的逐项自验在周中会话与开发流程,
            不进本屏。计划制定中或计划归档 PR 未合入时,验收屏只有一块空板:点「与验收助手新建
            验收」触发检测——检测通过才拉取计划、展开四步板面(目标与验收标准此时才同步上板);
            未合入弹报错、保持空板(硬门禁,不做草案预验收)。选版与项目上下文归左侧栏(G2
            外框);页头与计划屏同构:会话收折、更新代码(唯一同步入口)、配置自动化、批注模式、
            验收助手;会话栏为 Orca 原生会话占位,「验收助手」是该产品称呼。界面无灯:状态一律
            文字与真实读回。
          </p>
          <p>
            <strong>验收准备</strong>:「出包」是板面固定逻辑(按项目远端直连流水线,主分支
            构建);「部署」向验收助手会话注入请求——模型下载最新包、按项目自有部署入口部署
            启动(各服务逻辑不同,无固定脚本;桌面应用类=安装并启动,web 服务类=部署并起前
            端,演示为 web 服务型),完成后把环境 URL(或启动状态)写回材料,「演示环境」行读
            回、点击经内置 Orca 浏览器打开=真机演示环境。模型写 candidateRef、登记包
            (kind=package+checksum),对着运行环境按目标验收标准采集证据并演示分诊——易
            现场演示的标「现场演示+操作路径」,不易演示/需等待的落进
            <strong>一份</strong>验收证据报告(全目标合并:目标→验收点→说明+证据罗列+目标值
            vs 读数),登记进材料。包重出不刷新板面已填内容,模型在会话提醒是否重核。缺工具
            请人安装,不降级。
          </p>
          <p>
            <strong>Showcase 勾勾表</strong>:目标行复用计划屏形态(只读);行尾「达成/不达成」
            是人判结论(互斥、再点取消、未标空白),不是演示进度;会中逐条现场实操或打开报告
            对应验收点。指标证据只在报告,板面不回显指标区。Issue 只有「遗留」标记(风险已
            去掉)+备注;已关闭 Issue 不计遗留、已存备注只读。不达成目标出现「下一步」。
          </p>
          <p>
            <strong>批注与助手</strong>:批注模式、对象小窗与板面批注窗与计划屏同一组件族和
            交互(点击目标句或 Issue 行记录意见,Esc 先关小窗再退模式);发送走 Orca
            原生发送弹窗递交验收助手,作为会议纪要输入。页头验收助手图标只打开/聚焦左侧持久
            会话,不新建、不注入。纪要区不参与批注。
          </p>
          <p>
            <strong>会议纪要</strong>:纪要框常驻各时期、直接可编辑可粘贴,不依赖会话唤起;与
            计划屏同款两块结构(共识/遗留、人工确认生效);验收侧遗留条目<strong>无闭环位</strong>
            ——原样成为下版计划屏「会议遗留」;Issue「遗留」标记对应「延期遗留」。模型只整理
            草稿,不代确认。
          </p>
          <p>
            <strong>归档与发布</strong>:归档在会话发起,屏内只有 PR 引用+状态+打开 Orca 原生
            PR 页入口,无归档按钮。「发布」弹预检(版本号/发布提交与验收包一致/目标状态——
            不达成与未标不阻断,人知情决定)→ 发起请求 → 会话中经人明确授权执行 →
            读回行显示 tag/时间/资产;PR 未合入发布记录随同 PR 补注,已合入按归档后补证。
          </p>
          <p>
            <strong>依赖与遗留</strong>:组件与设计语言复用已合入 main 的 G3 计划屏
            (#391);导航与工作区归 G2。遗留待评审:自动重核机制去留、轮次协议、验收件富
            格式编辑、验收证据报告格式规范。演示数据¹:出包/部署/报告/人判/纪要/PR/发布状态
            均为预置,生产不预置人的结论。
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
          <div className="g3-nav-muted nested">计划</div>
          <div className="g3-nav-muted nested">
            任务 <span>{tasks.length}</span>
          </div>
          <div className="g3-nav-selected">
            <Icon name="target" size={14} />
            验收
          </div>
          <div className="g3-scope">
            <strong>G2 外框示意</strong>
            <span>导航与工作区由 G2 设计;选版在侧栏</span>
            <a href={g2Url} target="_blank" rel="noreferrer">
              查看 G2 设计 <Icon name="arrow" size={13} />
            </a>
          </div>
        </aside>
        <aside
          className={`g3-session ${session ? 'expanded' : 'rail'}`}
          aria-label="左侧 Orca 原生验收会话"
        >
          {session ? (
            <div className="g3-native-workspace">
              <Icon name="agent" size={28} />
              <h2>Orca 原生会话工作区</h2>
              <p>顶部标签栏、会话标题与全部控件均为 Orca 原生</p>
              <small>这里只示意会话位置,不另设计聊天界面;「验收助手」是这个原生会话的产品称呼</small>
            </div>
          ) : (
            <div className="g3-session-rail-text" aria-hidden="true">
              验收会话已收折
            </div>
          )}
        </aside>
        <main className="g3-main">
          <header className="g3-header">
            <div>
              <div className="g3-breadcrumb">
                Builder Workbench <span>/</span> v0.7
              </div>
              <h1>版本验收</h1>
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
              <button
                className="g3-text-button"
                title="把验收固定树快进到主干最新并重读材料与候选(唯一同步入口)"
                onClick={() =>
                  setNotice('已更新代码:验收树快进到主干最新,材料与候选已重读 · 演示示意')
                }
              >
                <Icon name="refresh" size={13} /> 更新代码
              </button>
              <button
                className="g3-text-button"
                title="打开原生自动化编辑器"
                onClick={() =>
                  setNotice('配置自动化打开 Orca 原生自动化编辑器 · 一次性配置(演示示意)')
                }
              >
                <Icon name="automation" size={13} /> 配置自动化
              </button>
              <IconButton
                name="annotate-mode"
                label="批注模式:点击板面元素记录评审意见"
                aria-pressed={annotating}
                className={annotating ? 'g3-mode-on' : ''}
                onClick={toggleAnnotating}
              />
              <IconButton
                name="agent"
                label="打开验收助手"
                className="g3-agent-button"
                onClick={() => toggleSession(true)}
              />
            </div>
          </header>
          <nav className="g3-journey" aria-label="验收旅程" hidden={scene === 'planned'}>
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
              批注模式:点击目标句或 Issue 行,在对象旁的小窗记录意见 · Esc 先关小窗,再按一次退出
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
              if (navigation.current || scene === 'planned') {
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
            {scene === 'planned' && (
              <div className="g3-empty-board">
                <p>v0.7 验收尚未开始。</p>
                <button onClick={startAcceptance}>与验收助手新建验收</button>
                <span className="g3-muted">
                  计划制定中、或计划归档 PR 尚未合入时,本页保持此空板,不显示验收各区。
                  点击「与验收助手新建验收」后检测计划合入状态:检测通过则拉取计划、展开验收
                  四步板面;未合入则报错并保持本页。
                </span>
                <button className="acc-demo-link" onClick={() => setErrorModal(true)}>
                  演示:计划 PR 未合入时的报错
                </button>
              </div>
            )}
            {scene !== 'planned' && (
              <>
                <section id="prepare">
                  <div className="g3-section-title">
                    <h2>
                      验收准备{' '}
                      <small>
                        {scene === 'started'
                          ? '候选未固定 · 尚未出包'
                          : `候选 ${CANDIDATE.short} · 已登记`}
                      </small>
                    </h2>
                  </div>
                  <div className="acc-prep-card">
                    <button
                      className="acc-pkg-toggle"
                      aria-expanded={pkgOpen}
                      onClick={() => setPkgOpen(!pkgOpen)}
                    >
                      <Icon name={pkgOpen ? 'down' : 'right'} size={14} />
                      <strong>出包</strong>
                      {latest ? (
                        <span className="g3-muted">
                          最新包 {latest.version.slice(0, 28)}… · {latest.created}
                        </span>
                      ) : (
                        <span className="g3-muted">暂无制品包</span>
                      )}
                    </button>
                    {pkgOpen && (
                      <>
                        <div className="acc-pkg-toolbar">
                          <label className="acc-pkg-label" htmlFor="acc-pipeline">
                            流水线
                          </label>
                          <select id="acc-pipeline" className="acc-select" aria-label="流水线名称">
                            {PIPELINES.map((name) => (
                              <option key={name}>{name}</option>
                            ))}
                          </select>
                          <button
                            className="acc-btn primary"
                            onClick={() =>
                              setNotice('流水线已启动,运行约需几分钟;最新包信息每分钟自动刷新。')
                            }
                          >
                            出包
                          </button>
                          <button
                            className="acc-btn"
                            disabled={!latest}
                            title={
                              latest
                                ? '向验收助手会话注入部署请求:下载最新包、按项目自有部署入口部署启动,完成后把环境 URL 写回材料'
                                : '尚无制品包;先出包'
                            }
                            onClick={() => {
                              toggleSession(true)
                              setDeployed(true)
                              setSentRequest({
                                kind: '部署请求',
                                text: '下载最新安装包并按项目自有部署入口部署启动;完成后把环境 URL(桌面应用则启动状态)写回材料'
                              })
                            }}
                          >
                            部署
                          </button>
                        </div>
                        {latest ? (
                          <dl className="acc-pkg-grid">
                            <dt>项目名称</dt>
                            <dt>版本号</dt>
                            <dt>创建时间</dt>
                            <dt>包文件</dt>
                            <dd>{latest.project}</dd>
                            <dd className="acc-mono" title={latest.version}>
                              {latest.version}
                            </dd>
                            <dd>{latest.created}</dd>
                            <dd className="acc-mono">{latest.files.join('、')}</dd>
                          </dl>
                        ) : (
                          <p className="g3-empty">
                            该服务暂无制品包。人点「出包」启动流水线,受理后最新包信息每分钟自动刷新。
                          </p>
                        )}
                      </>
                    )}
                    <div className="acc-row-line">
                      <span className="acc-line-label">演示环境</span>
                      {deployed ? (
                        <button
                          className="acc-report-link"
                          title="环境 URL 由验收助手部署后写回材料;点击经内置 Orca 浏览器打开"
                          onClick={openService}
                        >
                          http://127.0.0.1:4173
                          <Icon name="arrow" size={12} />
                        </button>
                      ) : (
                        <span className="g3-muted">
                          未部署 · 点「部署」注入请求,验收助手按项目入口部署并写回 URL
                        </span>
                      )}
                    </div>
                    <div className="acc-row-line">
                      <span className="acc-line-label">验收证据报告</span>
                      {report ? (
                        <>
                          <span className="acc-line-value">已生成 {report.generatedAt}</span>
                          <IconButton
                            name="arrow"
                            label="打开验收证据报告(Orca 内置浏览器)"
                            onClick={() =>
                              setNotice(`已在内置 Orca 浏览器打开 ${report.file} · 衔接示意`)
                            }
                          />
                        </>
                      ) : (
                        <span className="g3-muted">未生成 · 在会话中让验收助手采集并生成</span>
                      )}
                    </div>
                  </div>
                </section>
                <section id="showcase">
                  <div className="g3-section-title">
                    <h2>
                      Showcase <small>勾勾表 · 人判 {judged}/{goals.length}</small>
                    </h2>
                    <span className="g3-title-actions">
                      <IconButton
                        name={expanded.length === goals.length ? 'down' : 'right'}
                        label={expanded.length === goals.length ? '全部收起' : '全部展开'}
                        onClick={() =>
                          setExpanded(
                            expanded.length === goals.length ? [] : goals.map((g) => g.goalId)
                          )
                        }
                      />
                    </span>
                  </div>
                  <div className="g3-goal-list">
                    {goals.map((goal) => (
                      <AcceptanceRow
                        key={goal.goalId}
                        goal={goal}
                        tasks={tasks.filter((t) => t.goalId === goal.goalId)}
                        expanded={expanded.includes(goal.goalId)}
                        toggle={() =>
                          setExpanded((current) =>
                            current.includes(goal.goalId)
                              ? current.filter((id) => id !== goal.goalId)
                              : [...current, goal.goalId]
                          )
                        }
                        verdict={verdicts[goal.goalId] || null}
                        onVerdict={(value) => {
                          setVerdicts((current) => {
                            const next = { ...current }
                            if (value) {
                              next[goal.goalId] = value
                            } else {
                              delete next[goal.goalId]
                            }
                            return next
                          })
                          setNotice('本页演示修改 · 刷新后恢复原始材料')
                        }}
                        notes={issueNotes}
                        onNote={(number, value) =>
                          setIssueNotes((current) => ({ ...current, [number]: value }))
                        }
                        carry={carry}
                        onCarry={(number) =>
                          setCarry((current) => ({ ...current, [number]: !current[number] }))
                        }
                        goalNumbers={annotationNumbers[`${goal.goalId} 目标`] || []}
                        taskNumbers={annotationNumbers}
                        onOpenPanel={() => {
                          setPanelOpen(true)
                        }}
                        nextStep={nexts[goal.goalId] || ''}
                        onNext={(value) =>
                          setNexts((current) => ({ ...current, [goal.goalId]: value }))
                        }
                        reportReady={Boolean(report)}
                        onOpenReport={() =>
                          report
                            ? setNotice(`已在内置 Orca 浏览器打开报告 ${goal.goalId} 章 · 衔接示意`)
                            : setNotice('报告未生成;先在会话中让验收助手生成。')
                        }
                      />
                    ))}
                  </div>
                  <p className="g3-demo-footnote g3-annotation">
                    勾的含义只有「达成/不达成」,演示过与否不进材料;指标证据不回显板面,在验收
                    证据报告里。目标只读自计划,本屏不编辑目标。
                  </p>
                </section>
                <section id="minutes">
                  <div className="g3-section-title">
                    <h2>
                      会议纪要 <small>常驻可编辑 · 人工确认后生效</small>
                    </h2>
                  </div>
                  <MinutesCard
                    minutes={minutes || EMPTY_MINUTES}
                    sendRequest={sendRequest}
                    showAgent={false}
                    showFollowupStatus={false}
                    footNote="纪要经人工确认生效;遗留条目原样流入下版计划屏「会议遗留」。需要模型整理时直接在会话里说,或批注后发送。"
                    update={(patch) => {
                      setMinutes({ ...(minutes || EMPTY_MINUTES), ...patch })
                      setNotice('本页演示修改 · 刷新后恢复原始材料')
                    }}
                  />
                </section>
                <section id="archive">
                  {archive ? (
                    <div className="g3-archive">
                      <Icon name="pr" size={20} />
                      <div>
                        <h2>
                          验收归档 PR{' '}
                          <a className="g3-id" href={archive.url} target="_blank" rel="noreferrer">
                            #{archive.number}
                          </a>
                        </h2>
                        <p>
                          Leader 在 Orca 原生 PR 页再审验收记录,合入后归档;随 PR
                          带验收 JSON、证据报告与截图。
                        </p>
                      </div>
                      <IconButton
                        name="arrow"
                        label="打开原生 PR 页(衔接示意)"
                        onClick={() => {
                          setPrHandoff(true)
                          setNotice('')
                        }}
                      />
                      <span className="g3-archive-status">{archiveStatus}</span>
                    </div>
                  ) : (
                    <div className="g3-archive">
                      <Icon name="pr" size={20} />
                      <div>
                        <h2>验收归档 PR</h2>
                        <p>未创建 · 由验收助手在原生会话中发起,Leader 在 Orca 原生 PR 页再审。</p>
                      </div>
                    </div>
                  )}
                  <div className="acc-release">
                    {released ? (
                      <span className="acc-release-status on" role="status">
                        <Icon name="check" size={14} />
                        已发布 {releaseInfo.version} · {releaseInfo.at} · 3 资产读回一致
                      </span>
                    ) : (
                      <>
                        <span className="acc-release-status">未发布</span>
                        <button className="acc-btn primary" onClick={() => setReleaseModal(true)}>
                          发布
                        </button>
                      </>
                    )}
                  </div>
                  <p className="g3-demo-footnote g3-annotation">
                    发布经预检与知情授权:未达与未标不阻断。发布记录在 PR 未合入时随同一 PR
                    补注,已合入按归档后补证处理;未经明确授权不建 Release、不打标签。
                  </p>
                </section>
              </>
            )}
          </div>
          <footer className="g3-footer" role="status">
            {prHandoff ? (
              <div className="g3-footer-handoff">
                <span>验收归档 PR 在 Orca 原生 PR 页打开 · 衔接示意,不跳外部浏览器。</span>
                <IconButton
                  name="close"
                  label="收起原生 PR 说明"
                  onClick={() => setPrHandoff(false)}
                />
              </div>
            ) : releaseHandoff ? (
              <div className="g3-footer-handoff">
                <span>
                  发布请求已送入验收助手会话 · 经你明确授权后按项目发布入口执行,结果读回到发布行(演示)。
                </span>
                <IconButton
                  name="close"
                  label="收起发布说明"
                  onClick={() => setReleaseHandoff(false)}
                />
              </div>
            ) : sentRequest ? (
              <div className="g3-footer-handoff">
                <span>
                  {sentRequest.kind}已通过 Orca 原生发送弹窗递交验收助手:「{sentRequest.text}
                  」· 用户在弹窗确认目标会话后发送,演示不真正发送。
                </span>
                <IconButton
                  name="close"
                  label="收起发送说明"
                  onClick={() => setSentRequest(null)}
                />
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
        sendLabel="发送给验收助手"
        onClose={() => {
          setPanelOpen(false)
          setPopover(null)
        }}
        onUpdate={(id, text) =>
          setAnnotations((current) => current.map((item) => (item.id === id ? { ...item, text } : item)))
        }
        onRemove={(id) => setAnnotations((current) => current.filter((item) => item.id !== id))}
        onBoardLevel={(event) => openPopover('板面级', event.currentTarget.getBoundingClientRect())}
        onSend={() => {
          setPopover(null)
          sendRequest('以下是验收会在线批注,作为会议纪要输入整理', '批注')
        }}
      />
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
      {errorModal && (
        <div className="acc-modal-backdrop" onClick={() => setErrorModal(false)}>
          <section
            className="acc-modal"
            role="dialog"
            aria-modal="true"
            aria-label="无法开始验收"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h2>无法开始验收</h2>
              <IconButton name="close" label="关闭" onClick={() => setErrorModal(false)} />
            </header>
            <p>
              未检测到本版计划的归档 PR 已合入(当前读回:#386 待合入)。
              验收屏保持空板;待计划合入后再点「与验收助手新建验收」。
            </p>
            <footer>
              <button className="acc-btn" autoFocus onClick={() => setErrorModal(false)}>
                知道了
              </button>
            </footer>
          </section>
        </div>
      )}
      {releaseModal && (
        <ReleaseModal
          verdictSummary={verdictSummary}
          onClose={() => setReleaseModal(false)}
          onConfirm={() => {
            setReleaseModal(false)
            setReleased(true)
            setReleaseHandoff(true)
          }}
        />
      )}
    </div>
  )
}
createRoot(document.getElementById('root')).render(React.createElement(App))
