const { React, createRoot, useState } = window.BWPrototypeDependencies
import {
  MODULES,
  MODES,
  FLOW,
  FLOW_PHASES,
  VERSIONS,
  CONFIG_FACTS,
  initialState,
  initialRecords,
  PROMPTS,
  stepReadings,
  successLog,
  dotClass,
  moduleStateText,
  moduleButtons
} from './ci-model.js'
import { Icon, IconButton, ActionButton } from '../../version-planning/prototype/g3-components.jsx'

const clock = () => new Date().toTimeString().slice(0, 5)
const allOk = () => Object.fromEntries(FLOW.map((s) => [s.id, 'ok']))

function errorsOf(records, moduleId) {
  return records.filter((r) => r.moduleId === moduleId && !r.ok).length
}

// 步序号与状态读法：数字 1–6 常显（顺序在任何灯态下可读），完成只以徽章状态色表达。
const STEP_NO = Object.fromEntries(FLOW.map((s, i) => [s.id, i + 1]))
const STATUS_TEXT = {
  ok: '已完成',
  current: '执行中',
  fail: '失败',
  skip: '跳过',
  pending: '未开始'
}

// 竖排流程列表（板面核心）：最近一次执行的每步状态与一行读数自上而下排布；
// 执行中由 live（idx+done+mode+version）驱动逐步点亮，读数随完成进板面。
function FlowList({ state, live, mode }) {
  const [logOpen, setLogOpen] = useState(false)
  const last = state.last
  const liveReadings = live ? stepReadings(live.mode, live.version) : null
  const statusOf = (step) => {
    const prior = state.steps?.[step.id]
    if (!live) {
      return prior || 'pending'
    }
    if (live.done.includes(step.id)) {
      return 'ok'
    }
    if (FLOW[live.idx] && FLOW[live.idx].id === step.id) {
      return 'current'
    }
    return prior === 'ok' || prior === 'skip' ? prior : 'pending'
  }
  const readingOf = (step) => {
    if (live) {
      return live.done.includes(step.id) ? liveReadings[step.id] : null
    }
    return state.readings?.[step.id] || null
  }
  const headTime = live ? '执行中' : last ? `最近一次 ${last.time}` : '尚无执行记录'
  const headInfo = live
    ? `${live.mode === 'dev' ? '开发' : '上线'} 执行中${live.version ? ` · 版本 ${live.version}` : ''}`
    : last?.text
  return (
    <div className="ci-flow-block">
      <div className="ci-flow-head">
        <span className="ci-flow-head-time">{headTime}</span>
        <span className="ci-flow-head-info">{headInfo}</span>
        {last?.log && !live && (
          <button
            className="ci-flow-logtoggle"
            aria-expanded={logOpen}
            title="页内展开最近一次执行的整段日志（存于 bw/ci 树本地）"
            onClick={() => setLogOpen(!logOpen)}
          >
            {logOpen ? '收起日志' : '日志'}
          </button>
        )}
      </div>
      {logOpen && last?.log && !live && <pre className="ci-flow-log">{last.log}</pre>}
      <div className="ci-flow-list" role="list" aria-label="部署流程六步">
        {FLOW_PHASES.map((phase) => (
          <div className="ci-flow-group" key={phase} role="group" aria-label={phase}>
            <span className="ci-flow-phase">{phase}</span>
            {FLOW.filter((s) => s.phase === phase).map((step) => {
              const status = statusOf(step)
              const reading = readingOf(step)
              return (
                <div
                  key={step.id}
                  className={`ci-flow-step ${status}`}
                  role="listitem"
                  aria-label={`第 ${STEP_NO[step.id]} 步 ${step.name}：${STATUS_TEXT[status] || '未开始'}`}
                  title={`第 ${STEP_NO[step.id]} 步 · ${step.name}（${phase}）：${
                    mode === 'dev' ? step.dev : step.release
                  }${state.failedStep === step.id ? '（失败步）' : ''}`}
                >
                  <span className="ci-flow-badge" aria-hidden="true">
                    {STEP_NO[step.id]}
                  </span>
                  <div className="ci-flow-step-body">
                    <div className="ci-flow-step-line">
                      <span className="ci-flow-name">{step.name}</span>
                      {status === 'current' && <span className="ci-flow-status">执行中…</span>}
                      {status === 'fail' && <span className="ci-flow-status">失败</span>}
                      {status === 'skip' && <span className="ci-flow-status">跳过</span>}
                    </div>
                    {reading && <div className="ci-flow-reading">{reading}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// 部署卡：状态行 + 模式/版本/配置 + 最近一次执行块（竖排六步流程）+ 动作行；灰态给扫描事实行。
function ModuleCard({
  index,
  module,
  state,
  errors,
  executing,
  live,
  mode,
  version,
  onMode,
  onVersion,
  onConfigure,
  onAction
}) {
  const buttons = moduleButtons(module, state, errors)
  const isRelease = mode === 'release'
  return (
    <section id={module.id} className="ci-module">
      <div className="g3-section-title">
        <h2>
          {index + 1}·{module.name}
        </h2>
        <span className={`ci-state ${state.state}`}>
          <span className={`g3-dot ${dotClass(state.state)}`} aria-hidden="true" />
          {moduleStateText(module, state)}
        </span>
      </div>
      <div className={`ci-card ${state.state}`}>
        {state.state !== 'gray' && (
          <div className="ci-mode-row">
            <div className="ci-mode-toggle" role="group" aria-label="部署模式">
              {MODES.map(([value, label]) => (
                <button
                  key={value}
                  className={mode === value ? 'on' : ''}
                  disabled={executing}
                  title={
                    value === 'dev'
                      ? '开发部署：六步流程在本地跑，执行启动命令把服务跑起来；无包选择'
                      : '上线部署：六步流程在远端跑，部署所选版本的软件包；服务器密码在执行时输入'
                  }
                  onClick={() => onMode(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {isRelease &&
              (VERSIONS.length ? (
                <label
                  className="ci-version"
                  title="版本来自各版本验收材料的包登记，默认最新；包不存在的版本灰掉选不了"
                >
                  版本
                  <select
                    aria-label="选择部署版本"
                    value={version}
                    disabled={executing}
                    onChange={(e) => onVersion(e.target.value)}
                  >
                    {VERSIONS.map((v) => (
                      <option key={v.version} value={v.version} disabled={!v.available}>
                        {v.version} · {v.time}
                        {!v.available && ' · 包不存在'}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="ci-version-empty">验收屏未见包登记</span>
              ))}
            <span
              className="ci-config-facts"
              title="六步流程所需的项目资产经 CI 助手会话配置；板面只显示已配置/未配置"
            >
              {CONFIG_FACTS[mode].map(([name, ready]) => (
                <span key={name} className={`ci-config-fact ${ready ? '' : 'missing'}`}>
                  {name} {ready ? '已配置' : '未配置'}
                </span>
              ))}
            </span>
            <ActionButton
              className="ci-config-button"
              icon="edit"
              disabled={executing}
              title="向 CI 助手递交配置请求：配置六步流程所需的项目资产（开发启动命令与端口、探针 URL、上线服务器信息），已有配置先读出确认，经会话落项目资产随脚本同审；密码不进配置"
              onClick={onConfigure}
            >
              配置
            </ActionButton>
          </div>
        )}
        {state.state !== 'gray' && <FlowList state={state} live={live} mode={mode} />}
        {state.state === 'gray' && <p className="ci-hint">主分支未见脚本</p>}
        <div className="ci-actions">
          {buttons.map((b) => (
            <ActionButton
              key={b.key}
              disabled={executing}
              onClick={() => onAction(b.key, module)}
              title={
                b.key === 'generate'
                  ? '向 CI 助手递交生成请求：按 ci-ops skill 先勘察项目实际代码与已有部署资产，复用优先，按三阶段六步骨架编排，PR 经人审合入 main'
                  : b.key === 'run'
                    ? '向 CI 助手递交执行请求：六步流程在会话中执行并按步骤标记输出进度，完成后独立读回（状态/版本/耗时）并写记录'
                    : b.key === 'retry'
                      ? '向 CI 助手递交重试请求：从失败步起跑，之前步骤不重复执行（清场过的不用再清）'
                      : '定位到记录区并只看报错'
              }
            >
              {b.key === 'run' && executing ? `${module.short}中…` : b.label}
            </ActionButton>
          ))}
        </div>
      </div>
    </section>
  )
}

// 记录行：一行摘要常驻回显（含模式与版本）；报错条目默认折叠，展开在页内看日志，不去后台。
function RecordRow({ record, expanded, onToggle }) {
  const module = MODULES.find((m) => m.id === record.moduleId)
  return (
    <div className={`ci-record ${record.ok ? 'ok' : 'error'}`}>
      <div className="ci-record-line">
        {record.log ? (
          <button
            className="ci-record-toggle"
            aria-expanded={expanded}
            aria-label={`${expanded ? '收起' : '展开'} ${record.time} ${module.name}报错日志`}
            title={expanded ? '收起日志' : '展开日志（存于 bw/ci 树本地，页内回显）'}
            onClick={onToggle}
          >
            <Icon name={expanded ? 'down' : 'right'} size={12} />
          </button>
        ) : (
          <span className="ci-record-toggle placeholder" aria-hidden="true" />
        )}
        <span className="ci-record-time">{record.time}</span>
        <span className="ci-record-module">{module.name}</span>
        <span className={`ci-record-mode ${record.mode}`}>
          {record.mode === 'dev' ? '开发' : '上线'}
        </span>
        <span className="ci-record-result">
          {record.ok ? '✓' : '✗'} {record.result}
        </span>
        <span className="ci-record-detail">{record.detail}</span>
      </div>
      {record.log && expanded && <pre className="ci-record-log">{record.log}</pre>}
    </div>
  )
}

function App() {
  const [states, setStates] = useState(() => structuredClone(initialState))
  const [records, setRecords] = useState(() => [...initialRecords])
  const [session, setSession] = useState(true)
  const [notice, setNotice] = useState('')
  const [handoff, setHandoff] = useState(null)
  const [dark, setDark] = useState(false)
  const [compact, setCompact] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [executing, setExecuting] = useState(null)
  const [live, setLive] = useState(null)
  const [mode, setMode] = useState('release')
  const [version, setVersion] = useState(VERSIONS[0].version)
  const [filter, setFilter] = useState('all')
  const [recordsOpen, setRecordsOpen] = useState(false)
  const [openLogs, setOpenLogs] = useState([])

  const move = (id) => {
    document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }
  const toggleSession = (open) => {
    setSession(open)
  }
  // 对象级动作复用 Orca 原生发送弹窗：人确认「发什么、发给谁」后再发送。
  const sendRequest = (text, kind) => {
    toggleSession(true)
    setHandoff({ kind, text })
    setNotice('')
  }
  const setModule = (id, patch) =>
    setStates((current) => ({ ...current, [id]: { ...current[id], ...patch } }))

  // 六步流程演示执行：从 fromIdx 起逐步点亮；重试时之前步骤保持已通过，不重复执行。
  const runFlow = (module, fromIdx, runMode, runVersion) => {
    setExecuting(module.id)
    setLive({
      idx: fromIdx,
      done: [],
      mode: runMode,
      version: runMode === 'dev' ? null : runVersion
    })
    const isRetry = fromIdx > 0
    const prompt = isRetry
      ? PROMPTS.retry(runMode, runVersion, FLOW[fromIdx].id)
      : runMode === 'dev'
        ? PROMPTS.deployDev()
        : PROMPTS.deployRelease(runVersion)
    sendRequest(prompt, isRetry ? '从失败步重试请求' : `${module.short}请求`)
    setNotice(
      isRetry
        ? `从「${FLOW[fromIdx].name}」重试 · 已递交 CI 助手`
        : `${module.short}请求已递交 CI 助手`
    )
    let i = fromIdx
    const finish = () => {
      const time = clock()
      const text =
        runMode === 'dev'
          ? '全程 38 秒 · 本地探针 200'
          : `版本 ${runVersion} · 全程 3 分 08 秒 · /healthz 200`
      setExecuting(null)
      setLive(null)
      setModule(module.id, {
        state: 'green',
        steps: allOk(),
        failedStep: undefined,
        readings: stepReadings(runMode, runVersion),
        last: {
          time,
          ok: true,
          mode: runMode,
          version: runMode === 'dev' ? null : runVersion,
          text: `${runMode === 'dev' ? '开发' : '上线'} · ${text}`,
          log: successLog(runMode, runVersion)
        }
      })
      setRecords((current) => [
        {
          id: `demo-${Date.now()}`,
          time,
          moduleId: module.id,
          ok: true,
          mode: runMode,
          version: runMode === 'dev' ? null : runVersion,
          result: '成功',
          detail: text
        },
        ...current
      ])
      setNotice(
        isRetry
          ? `重试成功 · 六步全过 · 已写记录（「${FLOW[fromIdx].name}」之前步骤未重跑）`
          : `${module.name}执行成功 · 六步全过 · 已写记录`
      )
    }
    const step = () => {
      i += 1
      setLive((cur) => (cur ? { idx: i, done: [...cur.done, FLOW[i - 1].id] } : cur))
      if (i < FLOW.length) {
        setTimeout(step, 620)
      } else {
        setTimeout(finish, 500)
      }
    }
    setTimeout(step, 620)
  }

  const onAction = (key, module) => {
    if (key === 'generate') {
      sendRequest(PROMPTS.generate(), '生成脚本请求')
      setNotice(`已向 CI 助手递交生成${module.short}脚本请求`)
      return
    }
    if (key === 'errors') {
      setFilter('error')
      setRecordsOpen(true)
      move('records')
      setNotice('已定位到记录区 · 只看报错')
      return
    }
    if (key === 'retry') {
      const state = states[module.id]
      const fromIdx = Math.max(
        0,
        FLOW.findIndex((s) => s.id === (state.failedStep || 'deploy'))
      )
      runFlow(module, fromIdx, state.last?.mode || mode, state.last?.version || version)
      return
    }
    // run：部署单次执行，演示给执行中瞬态与流程条逐步点亮，完成后独立读回写记录。
    runFlow(module, 0, mode, version)
  }

  // 「更新代码」：把主检出快进到主干最新并重读资产与记录（演示只给回执）。
  const updateCode = () => {
    toggleSession(true)
    setNotice('已更新代码 · 资产与记录已重读（演示）')
  }

  // 统一配置入口：向 CI 助手递交配置请求，配置六步流程所需的项目资产。
  const onConfigure = () => {
    sendRequest(PROMPTS.configure(), '配置请求')
    setNotice('已向 CI 助手递交配置请求')
  }

  const filtered = filter === 'all' ? records : records.filter((r) => !r.ok)
  const errorCount = records.filter((r) => !r.ok).length

  return (
    <div className={`g3-app ${compact ? 'constrained' : ''}`}>
      <div className="g3-demo-bar">
        <strong>#461 评审草案 · CI 部署</strong>
        <span>两种模式 · 竖排六步流程（每步读数） · 记录默认收起</span>
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
            <strong>定位与边界</strong>：CI
            屏承载发布后的生产部署——验收屏「部署」只覆盖演示环境，生产机器的部署动作与结果读回在本屏。2026-10-28
            评审收敛为只做部署模块：目标是简化部署动作、帮助用户构建和使用已有的部署脚本；监控/故障检测/重启转后续演进。项目级入口「CI」与总览、任务同级；左侧
            Orca 原生会话（CI
            助手），右侧业务板面，与计划/验收两屏同构。页头：标题左、动作右——会话收折
            chip、更新代码（唯一同步入口）；不设批注模式。板面不铺说明文本：机制与配置收在按钮提示与
            ci-ops skill 正本，板面只留状态、读数、流程推进与动作。首次进入经原生工作树创建 bw/ci
            固定树，执行记录与错误日志存该树本地 .bw/ci/，默认不上仓。
          </p>
          <p>
            <strong>两种模式与统一配置入口</strong>
            ：开发部署在本地执行启动命令把服务跑起来；上线部署连服务器把所选版本的软件包部署到远端。版本来自各版本验收材料的包登记（版本
            →
            包路径），默认最新；包不存在的版本灰掉标「包不存在」，不隐藏——历史记录引用的版本对得上号。六步流程所需的配置（开发启动命令与端口、探针
            URL、上线服务器信息）经统一「配置」按钮向 CI
            助手递交请求：已有配置先读出给人确认、缺失项经会话收集，落项目资产随脚本同审；板面只显示各配置项「已配置/未配置」事实，不显示配置内容。密码不进配置——只在部署执行时输入（密文显示、不可复制、不落盘不进记录）。
          </p>
          <p>
            <strong>三阶段六步流程</strong>：部署前准备（软件包准备 → 预检 → 清场）→
            开始部署（部署）→ 部署后验证（验证 →
            记录）。软件包准备在最前——没有可用包（或未配置启动命令）时，失败发生在清场之前，不该把正在跑的服务停了；破坏性步骤（清场）尽量晚。任何步失败流程停在该步，红灯
            + failedStep
            进记录；「从失败步重试」只重跑失败步及其后步骤，已完成步不重复执行（清场过的不用再清）。脚本按步骤标记协议输出
            [ci-step]
            进度，板面流程列表据此自上而下逐步点亮，每步读数随完成进板面——把会话里模型的试错（端口冲突排查十分钟）变成脚本的确定性步骤（清场秒级）。竖排流程列表是板面核心：块头给最近一次读数与整段日志开关，每步徽章标序加一行读数事实；黄态（有脚本无记录）显示六步骨架。
          </p>
          <p>
            <strong>灯与记录</strong>
            ：灯是健康信号，只能从执行记录推导：灰=主检出未见脚本（新项目首见，板面给「主分支未见脚本」事实与生成脚本入口）；黄=扫到资产、待执行；绿=最近一次流程全步通过；红=最近一次停在失败步。最新结果决定绿红；历史报错永久保留。每次执行写
            bw/ci 树本地
            records.jsonl（时间、ok、mode、version、steps、readings、failedStep、耗时、日志指针），记录区降位为默认收起的一行摘要（全部/报错计数），展开后按时间倒序回显全部执行与报错（含模式与版本），报错默认折叠、页内展开看日志原文；「报错记录」按钮=展开记录区并只看报错。本页固定呈现已接入后的全量形态（评审反馈：不做场景切换，进入即见全部——全量指部署卡完整形态与记录摘要行）；灰/黄/红随真实数据自然出现。
          </p>
          <p>
            <strong>依赖与留白</strong>：组件与设计语言复用已合入 main 的 G3
            计划屏（#391）；导航与工作区归 G2
            外框。留白待评审：监控/故障检测/重启三模块的带入时机；多环境（测试/预发/生产）是否扩环境维度；告警通知通道；启动命令自动获取（v1
            为用户经会话输入）；脚本模板细则归 ci-ops skill 正本（gate 后落
            standard/skills/）。演示数据：版本登记、记录、日志、读数均为预置，生产不预置任何记录。
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
          <div className="g3-nav-muted">任务</div>
          <div className="g3-nav-selected">
            <Icon name="refresh" size={14} /> CI
          </div>
          <div className="g3-nav-muted">自动化</div>
          <div className="g3-nav-muted">知识库</div>
          <div className="g3-scope">
            <strong>bw/ci 固定树</strong>
            <span>记录与日志存本树，不上仓</span>
          </div>
        </aside>
        <aside
          className={`g3-session ${session ? 'expanded' : 'rail'}`}
          aria-label="左侧 Orca 原生 CI 会话"
        >
          {session ? (
            <div className="g3-native-workspace">
              <Icon name="agent" size={28} />
              <h2>Orca 原生会话工作区</h2>
              <p>顶部标签栏、会话标题与全部控件均为 Orca 原生</p>
              <small>
                这里只示意会话位置，不另设计聊天界面；「CI 助手」是这个原生会话的产品称呼
              </small>
              {handoff && (
                <details className="ci-session-draft" open>
                  <summary>最近递交的指令（{handoff.kind}）</summary>
                  <pre>{handoff.text}</pre>
                </details>
              )}
            </div>
          ) : (
            <div className="g3-session-rail-text" aria-hidden="true">
              CI 会话已收折
            </div>
          )}
        </aside>
        <main className="g3-main">
          <header className="g3-header">
            <div>
              <div className="g3-breadcrumb">
                Builder Workbench <span>/</span> 生产运维
              </div>
              <h1>CI</h1>
            </div>
            <div className="g3-header-actions">
              <button
                className="g3-session-chip"
                aria-expanded={session}
                aria-label={session ? '收折会话栏' : '展开会话栏'}
                title={session ? '收起会话栏，板面占满整幅；随时展开恢复' : '展开会话栏'}
                onClick={() => toggleSession(!session)}
              >
                <Icon name="chat" size={13} /> {session ? '收起会话' : '展开会话'}
              </button>
              <button
                className="g3-text-button"
                title="把主检出快进到主干最新并重读资产与记录（唯一同步入口）"
                onClick={updateCode}
              >
                <Icon name="refresh" size={13} /> 更新代码
              </button>
            </div>
          </header>
          <div className="g3-scroll">
            {MODULES.map((m, i) => (
              <ModuleCard
                key={m.id}
                index={i}
                module={m}
                state={states[m.id]}
                errors={errorsOf(records, m.id)}
                executing={executing === m.id}
                live={executing === m.id ? live : null}
                mode={mode}
                version={version}
                onMode={setMode}
                onVersion={setVersion}
                onConfigure={onConfigure}
                onAction={onAction}
              />
            ))}
            <section id="records" className="ci-records-section">
              <div
                className="g3-section-title ci-records-head"
                role="button"
                tabIndex={0}
                aria-expanded={recordsOpen}
                title={recordsOpen ? '收起记录列表' : '展开记录列表（存于 bw/ci 树本地）'}
                onClick={() => setRecordsOpen(!recordsOpen)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setRecordsOpen(!recordsOpen)
                  }
                }}
              >
                <h2>
                  2·执行与报错记录 <small>bw/ci 树本地</small>
                </h2>
                <span className="ci-records-counts">
                  全部 {records.length} · 报错 {errorCount}
                  <Icon name={recordsOpen ? 'down' : 'right'} size={14} />
                </span>
              </div>
              {recordsOpen && (
                <>
                  <div className="ci-filter" role="group" aria-label="筛选记录">
                    <button
                      className={filter === 'all' ? 'on' : ''}
                      onClick={() => setFilter('all')}
                    >
                      全部 {records.length}
                    </button>
                    <button
                      className={filter === 'error' ? 'on' : ''}
                      disabled={!errorCount}
                      onClick={() => setFilter('error')}
                    >
                      报错 {errorCount}
                    </button>
                  </div>
                  {filtered.length ? (
                    <div className="ci-records">
                      {filtered.map((r) => (
                        <RecordRow
                          key={r.id}
                          record={r}
                          expanded={openLogs.includes(r.id)}
                          onToggle={() =>
                            setOpenLogs((current) =>
                              current.includes(r.id)
                                ? current.filter((id) => id !== r.id)
                                : [...current, r.id]
                            )
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="g3-empty ci-records-empty">
                      {records.length ? '暂无报错记录' : '尚无执行记录'}
                    </p>
                  )}
                  {errorCount > 0 && <p className="ci-records-note">共 {errorCount} 条报错</p>}
                </>
              )}
            </section>
          </div>
          <footer className="g3-footer" role="status">
            {handoff ? (
              <div className="g3-footer-handoff">
                <span>
                  {handoff.kind}已递交 CI 助手：「{handoff.text}」
                </span>
                <IconButton name="close" label="收起发送说明" onClick={() => setHandoff(null)} />
              </div>
            ) : (
              notice || '评审草案 · 演示数据为预置'
            )}
          </footer>
        </main>
      </div>
    </div>
  )
}
createRoot(document.getElementById('root')).render(React.createElement(App))
