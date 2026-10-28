const { React, createRoot, useState } = window.BWPrototypeDependencies
import {
  MODULES,
  SCENARIOS,
  sceneStates,
  sceneRecords,
  PROMPTS,
  dotClass,
  moduleStateText,
  moduleButtons
} from './ci-model.js'
import { Icon, IconButton, ActionButton } from '../../version-planning/prototype/g3-components.jsx'

const clock = () => new Date().toTimeString().slice(0, 5)

function errorsOf(records, moduleId) {
  return records.filter((r) => r.moduleId === moduleId && !r.ok).length
}

// 部署卡：状态行 + 最近执行 + 动作行；灰态给扫描事实行，机制说明收在按钮提示。
function ModuleCard({ index, module, state, errors, executing, onAction }) {
  const buttons = moduleButtons(module, state, errors)
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
        {state.last && (
          <p className={`ci-last ${state.last.ok ? '' : 'bad'}`}>
            最近一次 {state.last.time}
            <span className="ci-last-mark">{state.last.ok ? '✓' : '✗'}</span>
            {state.last.text}
          </p>
        )}
        {state.state === 'gray' && <p className="ci-hint">主分支未见脚本</p>}
        {errors > 0 && state.state !== 'red' && (
          <p className="ci-errors-muted">历史报错 {errors} 条</p>
        )}
        <div className="ci-actions">
          {buttons.map((b) => (
            <ActionButton
              key={b.key}
              disabled={executing}
              onClick={() => onAction(b.key, module)}
              title={
                b.key === 'generate'
                  ? '向 CI 助手递交生成请求：按 ci-ops skill 先勘察项目实际代码与已有部署资产，复用优先，PR 经人审合入 main'
                  : b.key === 'run'
                    ? '向 CI 助手递交执行请求：脚本在会话中执行，完成后独立读回（状态/版本/耗时）并写记录'
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

// 记录行：一行摘要常驻回显；报错条目默认折叠，展开在页内看日志，不去后台。
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
  const [scene, setScene] = useState('first')
  const [states, setStates] = useState(() => structuredClone(sceneStates.first))
  const [records, setRecords] = useState(() => [...sceneRecords.first])
  const [session, setSession] = useState(true)
  const [notice, setNotice] = useState('')
  const [handoff, setHandoff] = useState(null)
  const [dark, setDark] = useState(false)
  const [compact, setCompact] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [executing, setExecuting] = useState(null)
  const [filter, setFilter] = useState('all')
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
  const switchScene = (value) => {
    setScene(value)
    setStates(structuredClone(sceneStates[value]))
    setRecords([...sceneRecords[value]])
    setHandoff(null)
    setExecuting(null)
    setFilter('all')
    setOpenLogs([])
    setNotice('')
  }
  const setModule = (id, patch) =>
    setStates((current) => ({ ...current, [id]: { ...current[id], ...patch } }))

  const onAction = (key, module) => {
    if (key === 'generate') {
      sendRequest(PROMPTS.generate(module), '生成脚本请求')
      setNotice(`已向 CI 助手递交生成${module.short}脚本请求`)
      return
    }
    if (key === 'errors') {
      setFilter('error')
      move('records')
      setNotice('已定位到记录区 · 只看报错')
      return
    }
    // run：部署单次执行，演示给执行中瞬态，完成后独立读回写记录。
    setExecuting(module.id)
    setNotice(`${module.short}请求已递交 CI 助手`)
    sendRequest(PROMPTS.deploy, `${module.short}请求`)
    setTimeout(() => {
      const time = clock()
      const text = '版本 1.4.199 · 全程 3 分 08 秒 · /healthz 200'
      setExecuting(null)
      setModule(module.id, { state: 'green', last: { time, ok: true, text } })
      setRecords((current) => [
        {
          id: `demo-${Date.now()}`,
          time,
          moduleId: module.id,
          ok: true,
          result: '成功',
          detail: text
        },
        ...current
      ])
      setNotice(`${module.name}执行成功 · 已写记录`)
    }, 1600)
  }

  // 「更新代码」在首次进入场景演示灰→黄：假定脚本已合入 main，主检出快进后扫描到资产。
  const updateCode = () => {
    toggleSession(true)
    if (scene === 'first') {
      setStates(structuredClone(sceneStates.armed))
      setScene('armed')
      setNotice('已更新代码 · 灯灰→黄（演示）')
    } else {
      setNotice('已更新代码（演示）')
    }
  }

  const filtered = filter === 'all' ? records : records.filter((r) => !r.ok)
  const errorCount = records.filter((r) => !r.ok).length

  return (
    <div className={`g3-app ${compact ? 'constrained' : ''}`}>
      <div className="g3-demo-bar">
        <strong>#461 评审草案 · CI 部署</strong>
        <span>部署模块状态灯 · 场景与动作仅在本页演示</span>
        <label className="g3-scene">
          场景
          <select
            aria-label="切换演示场景"
            value={scene}
            onChange={(e) => switchScene(e.target.value)}
          >
            {SCENARIOS.map(([id, label]) => (
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
            <strong>定位与边界</strong>：CI
            屏承载发布后的生产部署——验收屏「部署」只覆盖演示环境，生产机器的部署动作与结果读回在本屏。2026-10-28
            评审收敛为只做部署模块：目标是简化部署动作、帮助用户构建和使用已有的部署脚本；监控/故障检测/重启转后续演进。项目级入口「CI」与总览、任务同级；左侧
            Orca 原生会话（CI
            助手），右侧业务板面，与计划/验收两屏同构。页头：标题左、动作右——会话收折
            chip、更新代码（唯一同步入口）；不设批注模式。板面不铺说明文本：模块语义、脚本资产、扫描机制收在按钮提示与
            ci-ops skill 正本，板面只留状态、读数与动作。首次进入经原生工作树创建 bw/ci
            固定树，执行记录与错误日志存该树本地 .bw/ci/，默认不上仓。
          </p>
          <p>
            <strong>部署与灯</strong>
            ：部署=把已发布版本的包装到指定环境，完成后独立读回（服务状态、版本、耗时）并写执行记录；单次执行，人点按钮注入请求。助手按
            ci-ops skill 生成脚本时复用项目已有资产优先（构建、装机、重启、监督脚本编排进
            .bw/ci/deploy.sh 一条入口），缺失环节才按模板生成——样板间 gtsllm-dfx
            已实证：项目已有脚本零改动，一条命令完成构建→部署→读回→记录。灯是健康信号，只能从执行记录推导：灰=主检出未见脚本；黄=扫到资产、待执行；绿=最近一次成功；红=最近一次失败。最新结果决定绿红；历史报错永久保留。
          </p>
          <p>
            <strong>接入与执行</strong>：灰态点「生成部署脚本」向 CI
            助手递交请求——勘察项目实际代码与已有部署资产后生成 .bw/ci/deploy.sh，PR 经人审合入
            main；板面每 5
            秒扫描主检出固定路径，扫到即灰→黄。执行全会话驱动：人点按钮注入请求，脚本在会话中真实跑，完成后独立读回写记录；失败如实红、不自动重试刷绿，恢复靠下一次真实成功。不替人确认任何完成。
          </p>
          <p>
            <strong>记录与回显</strong>：每次执行结果写 bw/ci 树本地
            records.jsonl（时间、ok、版本、读回读数、耗时；失败附错误摘要与日志指针）。记录区按时间倒序回显全部执行与报错，可只看报错；报错条目默认折叠、页内展开看日志，不让用户去后台翻文件。脚本资产在项目
            main（人审合入），运行数据在 bw/ci 本地（不上仓）——代码与数据分离。
          </p>
          <p>
            <strong>依赖与留白</strong>：组件与设计语言复用已合入 main 的 G3
            计划屏（#391）；导航与工作区归 G2
            外框。留白待评审：监控/故障检测/重启三模块的带入时机；多环境（测试/预发/生产）是否扩环境维度；告警通知通道；脚本模板细则归
            ci-ops skill 正本（gate 后落
            standard/skills/）。演示数据：记录、日志、读数均为预置，生产不预置任何记录。
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
                title="把主检出快进到主干最新并重读资产与记录（唯一同步入口）；首次进入场景演示灰→黄"
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
                onAction={onAction}
              />
            ))}
            <section id="records" className="ci-records-section">
              <div className="g3-section-title">
                <h2>
                  2·执行与报错记录 <small>bw/ci 树本地</small>
                </h2>
                <span className="ci-filter" role="group" aria-label="筛选记录">
                  <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
                    全部 {records.length}
                  </button>
                  <button
                    className={filter === 'error' ? 'on' : ''}
                    disabled={!errorCount}
                    onClick={() => setFilter('error')}
                  >
                    报错 {errorCount}
                  </button>
                </span>
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
