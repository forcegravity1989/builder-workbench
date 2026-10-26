const { React, createRoot, useState, useRef, useEffect, Download } = window.BWPrototypeDependencies
import {
  snapshot,
  stages,
  scenes,
  PIPELINES,
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
  sortIssueRows,
  minutesRequestPrompt,
  g2Url
} from './acceptance-model.js'
import { annotationsSendPrompt, taskKind } from '../../version-planning/prototype/g3-model.js'
import {
  Icon,
  IconButton,
  ActionButton,
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

// A single human decision; choosing the empty option clears the recorded verdict.
function Verdict({ goalId, value, onSet }) {
  return (
    <span className="acc-verdict">
      <select
        className={`acc-verdict-select${value === '达成' ? ' met' : value === '不达成' ? ' unmet' : ''}`}
        aria-label={`${goalId} 验收结论`}
        title="由人核对实物后判定；选择未判定可清除结论"
        value={value || ''}
        onChange={(event) => onSet(event.target.value || null)}
      >
        <option value="">未判定</option>
        <option value="达成">达成</option>
        <option value="不达成">不达成</option>
      </select>
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
  onOpenTask
}) {
  const goalTarget = `${goal.goalId} 目标`
  // 验收标准参与批注(#426 验收会决议,与计划屏对齐);「下一步」输入件仍不参与。
  const criteriaTarget = `${goal.goalId} · 验收标准`
  const criteriaNumbers = taskNumbers[criteriaTarget] || []
  const open = tasks.filter((task) => task.state === 'OPEN')
  const closedCount = tasks.filter((task) => task.state === 'CLOSED').length
  const carryCount = open.filter((task) => carry[task.number]).length
  const unknownCount = tasks.length - open.length - closedCount
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
            className="acc-annot-count"
            aria-label={`${goalTarget} 的批注 ${goalNumbers.length} 条`}
            title="打开板面批注窗"
            onClick={onOpenPanel}
          >
            <Icon name="annotate" size={12} />
            {goalNumbers.join(',')}
          </button>
        )}
        <span
          className="g3-goal-count acc-issue-counts"
          title="遗留是未关闭 Issue 中人工标记的部分"
        >
          未关闭 {open.length} · 遗留 {carryCount} · 已关闭 {closedCount}
          {unknownCount > 0 && <> · 未知 {unknownCount}</>}
        </span>
        <Verdict goalId={goal.goalId} value={verdict} onSet={onVerdict} />
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
          <div className="g3-acceptance" data-annotate={criteriaTarget}>
            <h3>
              验收标准 <small className="g3-muted">只读自计划</small>
              {criteriaNumbers.length > 0 && (
                <button
                  className="acc-annot-count"
                  aria-label={`${criteriaTarget} 的批注 ${criteriaNumbers.length} 条`}
                  title="打开板面批注窗"
                  onClick={onOpenPanel}
                >
                  <Icon name="annotate" size={12} />
                  {criteriaNumbers.join(',')}
                </button>
              )}
            </h3>
            <Lines text={goal.acceptance} />
          </div>
          <div className="g3-task-head">
            <h3>
              关联 Issue <span>{tasks.length}</span>
            </h3>
            {/* 报告入口只在「验收准备」的证据报告行(报告一份/版本);目标行不再
                重复设入口——2026-10-23 高保真反馈。 */}
          </div>
          <div className="g3-tasks">
            {tasks.length ? (
              sortIssueRows(tasks).map((task) => {
                const taskTarget = `${goal.goalId} · #${task.number}`
                const numbers = taskNumbers[taskTarget] || []
                const kind = task.readable ? taskKind(task.labels) : null
                return (
                  <div className="g3-task" key={task.number} data-annotate={taskTarget}>
                    {task.readable ? (
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
                    ) : (
                      <span className="g3-id">#{task.number}</span>
                    )}
                    {kind && (
                      <span
                        className={`g3-task-kind${kind === 'Bug' ? ' bug' : ''}`}
                        title="由 Issue 标签推导"
                      >
                        {kind}
                      </span>
                    )}
                    <span className="g3-task-state">
                      {task.state === 'CLOSED'
                        ? '已关闭'
                        : task.state === 'OPEN'
                          ? '开放'
                          : '状态未知'}
                    </span>
                    {numbers.length > 0 && (
                      <button
                        className="acc-annot-count"
                        aria-label={`${taskTarget} 的批注 ${numbers.length} 条`}
                        title="打开板面批注窗"
                        onClick={onOpenPanel}
                      >
                        <Icon name="annotate" size={12} />
                        {numbers.join(',')}
                      </button>
                    )}
                    {task.readable && task.state !== 'CLOSED' && (
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
                    {(!task.readable || task.state === 'CLOSED') && notes[task.number] && (
                      <span
                        className="acc-note-readonly"
                        title={
                          task.readable
                            ? '已关闭 Issue:已存备注只读展示,不再编辑'
                            : '状态读不到，已存备注只读'
                        }
                      >
                        {notes[task.number]}
                      </span>
                    )}
                    {!task.readable && carry[task.number] && (
                      <span className="acc-carry on" title="状态读不到；保留已存遗留标记">
                        遗留
                      </span>
                    )}
                    {task.readable && (
                      <IconButton
                        name="arrow"
                        label={`打开 #${task.number} 原生任务详情(衔接示意)`}
                        onClick={() => onOpenTask(task.number)}
                      />
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

function App() {
  const [scene, setScene] = useState('wrap')
  const [workflowStarted, setWorkflowStarted] = useState(true)
  const [verdicts, setVerdicts] = useState({ ...sceneVerdicts.wrap })
  const [issueNotes, setIssueNotes] = useState({ ...sceneIssueNotes.wrap })
  const [carry, setCarry] = useState({ ...sceneCarry.wrap })
  const [nexts, setNexts] = useState({ G3: nextSteps.G3 })
  const [minutes, setMinutes] = useState(() =>
    sceneMinutes.wrap ? structuredClone(sceneMinutes.wrap) : null
  )
  const [archive, setArchive] = useState(sceneArchive.wrap)
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
  const goals = scene === 'unmerged' ? [] : snapshot.plan.goals
  const tasks = scene === 'unmerged' ? [] : taskRows()
  const latest = sceneLatest[scene] ?? null
  const report = scene === 'meeting' || scene === 'wrap' ? REPORT : null
  const notStarted = !workflowStarted
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
  const sendRequest = (text, kind, detail) => {
    toggleSession(true)
    setSentRequest({ kind, text, detail })
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
    setNotice(
      next ? '批注模式:点击目标行、验收标准或 Issue 行,在对象旁的小窗记录意见 · Esc 退出' : ''
    )
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
  const onScrollClickCapture = (event) => {
    if (!annotating) {
      return
    }
    // 已存在的合并角标保留自己的点击(重开面板)，不弹对象小窗——对齐生产捕获层豁免。
    if (event.target.closest('.acc-annot-count')) {
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
    setWorkflowStarted(value !== 'planned' && value !== 'unmerged')
    setVerdicts({ ...sceneVerdicts[value] })
    setIssueNotes({ ...sceneIssueNotes[value] })
    setCarry({ ...sceneCarry[value] })
    setNexts(value === 'wrap' ? { G3: nextSteps.G3 } : {})
    setMinutes(sceneMinutes[value] ? structuredClone(sceneMinutes[value]) : null)
    setArchive(sceneArchive[value])
    setReleaseHandoff(false)
    setDeployed(value === 'meeting' || value === 'wrap')
    setPrHandoff(false)
    setSentRequest(null)
    setPopover(null)
    setAnnotating(false)
    setPanelOpen(false)
    setAnnotations([])
    setExpanded([])
    setActive('prepare')
    if (value === 'planned' || value === 'unmerged') {
      setSession(false)
    }
    setNotice('')
  }
  // Opening the native conversation does not approve or merge a plan.
  const startAcceptance = () => {
    if (scene === 'unmerged') {
      setWorkflowStarted(true)
    } else {
      switchScene('started')
    }
    toggleSession(true)
    setNotice('已打开验收会话')
  }
  const openService = () => {
    toggleSession(true)
    setNotice('已在内置 Orca 浏览器打开 http://127.0.0.1:4173 · 衔接示意')
  }
  return (
    <div className={`g3-app ${compact ? 'constrained' : ''} ${annotating ? 'annotating' : ''}`}>
      <div className="g3-demo-bar">
        <strong>#439 局部候选 · 验收</strong>
        <span>沿用既有四区 · 场景与编辑仅在本页演示</span>
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
            <strong>定位与边界</strong>:验收屏为周五验收会议服务,四步——验收准备 → Showcase →
            会议纪要 → 归档 PR 及发版本。个人对需求的逐项自验在周中会话与开发流程,
            不进本屏。尚未开始时与计划屏同为短启动卡；“开始验收”先打开原生会话并显示既有四区。
            计划未合入或归档状态未知时由验收助手核对、提醒和协助处理，不自动合入。
            未取得可读固定计划时目标区留空，不借用其他版本的目标。选版与项目上下文归左侧栏(G2
            外框);页头与计划屏同构:会话收折、批注模式、更新代码(唯一同步入口)、配置自动化——
            批注模式入口在页头右上角(#426 验收会决议,两屏同:页头不随内容滚动,会中随时进出、
            未发送条数角标常驻可见,取代第九轮「入口贴对象」形态);
            <strong>不设全局助手按钮</strong>:「唤起验收助手」的入口按对象就近放置
            (纪要区「整理纪要」、归档区「发起归档」);部署/发布兼任请求注入,出包为直接动作
            ——板面按钮一律图标+短动词统一格式;Showcase 无模型填写事务,不设助手入口。会话栏为 Orca
            原生会话占位,「验收助手」 是该产品称呼。界面无灯:状态一律文字与真实读回。
          </p>
          <p>
            <strong>验收准备</strong>:「出包」是板面固定逻辑(按项目远端直连流水线,主分支
            构建)，与“下载”同在出包展开区；“部署”常驻演示环境行，向验收助手会话注入请求——模型下载最新包、按项目自有部署入口部署
            启动(各服务逻辑不同,无固定脚本;桌面应用类=安装并启动,web 服务类=部署并起前 端,演示为 web
            服务型),完成后把演示环境写回材料(web 服务:系统名+URL;桌面应用:启动状态),
            「演示环境」行显示系统名(无系统名回退 URL),点击经内置 Orca
            浏览器打开=真机演示环境。模型写 candidateRef、登记包
            (kind=package+checksum),对着运行环境按目标验收标准采集证据并演示分诊——易
            现场演示的标「现场演示+操作路径」,不易演示/需等待的落进
            <strong>一份</strong>验收证据报告(全目标合并:目标→验收点→说明+证据罗列+目标值 vs
            读数),登记进材料。包重出不刷新板面已填内容,模型在会话提醒是否重核。缺工具
            请人安装,不降级。
          </p>
          <p>
            <strong>Showcase</strong>
            :目标行复用计划屏形态(只读);行尾单个选择器显示未判定、达成或不达成，
            选择未判定可清除人判结论。颜色沿用现有实现的中性色与警示色；结论不是演示进度。会中逐条现场实操或打开报告
            对应验收点。指标证据只在报告,板面不回显指标区。Issue 只有「遗留」标记(风险已
            去掉)+备注；可读 Issue 依标签显示
            Feature/Bug，按未关闭、未知、已关闭分组，组内沿用计划顺序。 已关闭 Issue
            不计遗留、已存备注只读。不达成目标出现「下一步」。
          </p>
          <p>
            <strong>批注与助手</strong>:批注模式、对象小窗与板面批注窗与计划屏同一组件族和
            交互(入口在页头右上角,带未发送条数角标;点击目标行、验收标准或 Issue 行记录意见, Esc
            先关小窗再退模式);发送走 Orca 原生发送弹窗递交验收助手,共享发送句为中性抬头
            「会议反馈批注内容如下：」,屏别意图(按对象回应或修订材料、会议纪要输入之一)归
            version-acceptance Skill,
            <strong>发送成功即清空已递交批注</strong>(每次发送都是全量清单、以最新一次为准,
            与计划屏同一决定);批注会话按板面身份分开存,切屏保留、切版清空。页头不设全局
            助手按钮;助手入口按对象就近放置(纪要区「整理纪要」、归档区「发起归档」),
            都只把请求递交左侧持久验收会话,不新建、不注入。纪要区不参与批注。
          </p>
          <p>
            <strong>会议纪要</strong>
            :纪要卡常驻各时期、点「编辑纪要」进入编辑态后增删改或粘贴,不依赖会话唤起;与
            计划屏同款两块结构(共识/遗留、人工确认生效)。归档前每条遗留写明落实结果或关联跟进
            Issue， 由助手核对、人在 PR 中确认，不增加界面门禁。关联 Issue 不代表事情已完成；
            下版会议回顾只提供来源参考，不自动生成任务或承诺。Issue「遗留」标记仍对应「延期遗留」。
          </p>
          <p>
            <strong>归档与发布</strong>:归档由会话执行,屏内放 PR 引用+状态+打开 Orca 原生 PR
            页入口+注入式「让验收助手发起归档」入口,无直接执行归档的按钮。发布区只有
            一个「发布」按钮,点击即把请求注入验收会话——预检、发布提交与验收包一致性核对、
            知情授权、按项目自有发布入口执行与发布后独立读回全在会话中完成并在会话中报告。
            <strong>板面不设预检弹窗、不设发布状态读回行,材料不存发布记录</strong>:发布读数的 正本在
            Git 标签与 provider Release 页,抄一份进板面即造第二正本;总览也不显示「已发布」。
            不达成与未标不阻断发布,由人知情决定;未经明确授权不建 Release、不打标签。
          </p>
          <p>
            <strong>依赖与遗留</strong>:组件与设计语言复用已合入 main 的 G3 计划屏
            (#391);导航与工作区归 G2。遗留待评审:自动重核机制去留、验收件富
            格式编辑、验收证据报告格式规范(轮次协议已随 v10
            跨周场景退役删除)。演示数据¹:出包/部署/报告/人判/纪要/PR/发布状态
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
              <small>
                这里只示意会话位置,不另设计聊天界面;「验收助手」是这个原生会话的产品称呼
              </small>
              {scene === 'unmerged' && workflowStarted && (
                <p className="acc-session-handoff" role="status">
                  会话交接示意：本版计划尚未合入，验收助手将核对计划依据、提醒并协助处理，不会自动合入。
                </p>
              )}
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
              {/* 批注入口在页头右上角(#426 验收会决议,两屏同):页头不随内容滚动,
                  会中随时进出批注模式、未发送条数角标常驻可见。空板(scene=planned)
                  无批注对象,不渲染。 */}
              {!notStarted && (
                <button
                  type="button"
                  className={`g3-text-button g3-annotate-entry${annotating ? ' g3-mode-on' : ''}`}
                  aria-pressed={annotating}
                  title={
                    annotating
                      ? '退出批注模式(Esc 同样退出)'
                      : '批注模式:点击目标行、验收标准或 Issue 行记录验收意见'
                  }
                  onClick={toggleAnnotating}
                >
                  <Icon name="annotate-mode" size={13} /> 批注模式
                  {annotations.length > 0 && (
                    <span className="g3-annotate-count">{annotations.length}</span>
                  )}
                </button>
              )}
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
            </div>
          </header>
          {!notStarted && (
            <nav className="g3-journey" aria-label="验收旅程">
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
          )}
          {annotating && (
            <div className="g3-annotate-banner" role="status">
              批注模式:点击目标句、验收标准或 Issue 行,在对象旁的小窗记录意见 · Esc
              先关小窗,再按一次退出
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
              if (navigation.current || notStarted) {
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
            {notStarted && (
              <div className="g3-empty-board">
                <p>v0.7 验收尚未开始。</p>
                <button onClick={startAcceptance}>开始验收</button>
              </div>
            )}
            {!notStarted && (
              <>
                <section id="prepare">
                  <div className="g3-section-title">
                    <h2>
                      验收准备{' '}
                      <small>
                        {scene === 'started' || scene === 'unmerged'
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
                          <ActionButton
                            icon="plus"
                            title="直连项目远端流水线,启动主分支构建"
                            onClick={() =>
                              setNotice('流水线已启动,运行约需几分钟;最新包信息每分钟自动刷新。')
                            }
                          >
                            出包
                          </ActionButton>
                          <button
                            className="g3-action-button"
                            disabled={!latest}
                            title={latest ? '选择本地目录，下载最新制品包' : '尚无制品包；先出包'}
                            onClick={() =>
                              setNotice('演示：打开原生目录选择器后下载制品包，本页不实际下载。')
                            }
                          >
                            <Download size={14} aria-hidden="true" /> 下载
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
                            暂无制品包 · 点「出包」启动流水线,最新包信息每分钟自动刷新。
                          </p>
                        )}
                      </>
                    )}
                    <div className="acc-row-line">
                      <span className="acc-line-label">演示环境</span>
                      {deployed ? (
                        <button
                          className="acc-report-link"
                          title="经内置 Orca 浏览器打开 http://127.0.0.1:4173"
                          onClick={openService}
                        >
                          演示系统
                          <Icon name="arrow" size={12} />
                        </button>
                      ) : (
                        <span className="g3-muted">未部署 · 点「部署」注入请求</span>
                      )}
                      <ActionButton
                        disabled={!latest}
                        title={latest ? '向验收助手会话注入部署请求' : '尚无制品包；先出包'}
                        onClick={() =>
                          sendRequest(
                            '下载最新安装包，按项目自有部署入口部署启动，完成后给出本次演示环境',
                            '部署请求'
                          )
                        }
                      >
                        部署
                      </ActionButton>
                    </div>
                    <div className="acc-row-line">
                      <span className="acc-line-label">验收证据报告</span>
                      {report ? (
                        <>
                          <span className="acc-line-value">已生成 {report.generatedAt}</span>
                          <IconButton
                            name="arrow"
                            label="打开验收证据报告(Orca 内置浏览器)"
                            onClick={() => {
                              toggleSession(true)
                              setNotice(`已在内置 Orca 浏览器打开 ${report.file} · 衔接示意`)
                            }}
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
                    <h2>Showcase</h2>
                    <span className="g3-title-actions">
                      {goals.length > 0 && (
                        <IconButton
                          name="refresh"
                          label="刷新 Issue"
                          onClick={() => setNotice('Issue 状态已重读 · 演示')}
                        />
                      )}
                      {goals.length > 0 && (
                        <IconButton
                          name={expanded.length === goals.length ? 'down' : 'right'}
                          label={expanded.length === goals.length ? '全部收起' : '全部展开'}
                          onClick={() =>
                            setExpanded(
                              expanded.length === goals.length ? [] : goals.map((g) => g.goalId)
                            )
                          }
                        />
                      )}
                    </span>
                  </div>
                  <div className="g3-goal-list">
                    {!goals.length && <p className="g3-empty">尚无可读的固定计划，目标暂为空。</p>}
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
                          setNotice('')
                        }}
                        nextStep={nexts[goal.goalId] || ''}
                        onNext={(value) =>
                          setNexts((current) => ({ ...current, [goal.goalId]: value }))
                        }
                        onOpenTask={(number) =>
                          setNotice(`打开 #${number} 原生任务详情 · 衔接示意`)
                        }
                      />
                    ))}
                  </div>
                  <p className="g3-demo-footnote g3-annotation">
                    结论由人选择，可改回未判定；指标证据在验收证据报告里；目标只读自计划。
                  </p>
                </section>
                <section id="minutes">
                  <div className="g3-section-title">
                    <h2>
                      会议纪要 <small>人工确认后生效</small>
                    </h2>
                    <span className="g3-title-actions">
                      {/* 图标 + 短动词,与生产一致:纯小图标动作点真机验证过于隐蔽
                          (2026-10-22 计划屏真机反馈轮结论),且发送弹窗的触发件不用
                          带 Tooltip 的图标按钮。 */}
                      <ActionButton
                        title="让验收助手整理纪要(可提供会议 ID)"
                        onClick={() => sendRequest(minutesRequestPrompt, '整理纪要请求')}
                      >
                        整理纪要
                      </ActionButton>
                    </span>
                  </div>
                  <MinutesCard
                    minutes={minutes || EMPTY_MINUTES}
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
                          Leader 在 Orca 原生 PR 页再审验收记录,合入后归档;随 PR 带验收
                          JSON、证据报告与截图。
                        </p>
                      </div>
                      <ActionButton
                        title="让验收助手核对材料并发起归档"
                        onClick={() =>
                          sendRequest(
                            '归档 本版:核对验收材料与结论状态后发起归档,在会话中给出归档 PR',
                            '归档请求'
                          )
                        }
                      >
                        发起归档
                      </ActionButton>
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
                        <p>未创建 · 归档由验收助手在会话中执行,Leader 在 Orca 原生 PR 页再审。</p>
                      </div>
                      <ActionButton
                        title="让验收助手核对材料并发起归档"
                        onClick={() =>
                          sendRequest(
                            '归档 本版:核对验收材料与结论状态后发起归档,在会话中给出归档 PR',
                            '归档请求'
                          )
                        }
                      >
                        发起归档
                      </ActionButton>
                    </div>
                  )}
                  <div className="acc-release">
                    {/* 规格:板面只有这一个发布入口,点击即注入请求。不设预检弹窗、
                        不设发布状态读回行、材料不存发布记录——发布读数的正本在 Git
                        标签与 provider Release 页,抄一份进板面即造第二正本。 */}
                    {/* 生产发布用 Rocket 图标;vendor 冻结图标集无 rocket,原型以 send 近似。 */}
                    <ActionButton
                      icon="send"
                      title="发布请求注入验收助手会话;预检与授权在会话中完成"
                      onClick={() => {
                        sendRequest(
                          `发布 ${releaseInfo.version}:先在会话中完成预检并报告,经我明确授权后再执行`,
                          '发布请求'
                        )
                        setReleaseHandoff(true)
                      }}
                    >
                      发布
                    </ActionButton>
                  </div>
                  <p className="g3-demo-footnote g3-annotation">
                    预检、授权、执行与读回全在会话中完成;未经明确授权不建 Release、不打标签。
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
                  发布请求已送入验收助手会话 ·
                  预检、授权、执行与读回都在会话中完成;未经你明确授权不创建 Release、不打标签。
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
                  」· 用户在弹窗确认目标会话后发送,演示不真正发送。{sentRequest.detail}
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
          setAnnotations((current) =>
            current.map((item) => (item.id === id ? { ...item, text } : item))
          )
        }
        onRemove={(id) => setAnnotations((current) => current.filter((item) => item.id !== id))}
        onBoardLevel={(event) => openPopover('板面级', event.currentTarget.getBoundingClientRect())}
        onSend={() => {
          setPopover(null)
          const count = annotations.length
          // 发送成功即清掉已递交的批注(与计划屏第八轮 A 案同一决定):批注是
          // 会议速记、每次发送都是全量清单,留着会让下一次发送把已递交条目重复
          // 喂给助手、污染纪要。模式与面板保持开启,面板转「暂无批注」读作
          // 「已全部递交」。
          setAnnotations([])
          sendRequest(
            annotationsSendPrompt(count),
            '批注',
            `已递交的 ${count} 条批注已从板面清空,可继续批注。`
          )
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
    </div>
  )
}
createRoot(document.getElementById('root')).render(React.createElement(App))
