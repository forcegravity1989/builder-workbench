import { IconAction } from '../../version-workspace/prototype/g2-icon-action.jsx'
import {
  Dialog,
  Feature,
  SectionTitle,
  SourcePanel,
  ReferencePanel
} from './overview-components.jsx'
import {
  snapshot,
  repository,
  revision,
  scenarios,
  features,
  currentTasks,
  shortTitle,
  issueState,
  prState,
  material
} from './overview-data.js'
const {
  // Used by the shared JSX build factory.
  // eslint-disable-next-line no-unused-vars
  React,
  useState,
  useEffect,
  createRoot,
  LayoutDashboard,
  CalendarRange,
  ClipboardCheck,
  ListTodo,
  BookOpen,
  GitBranch,
  ChevronDown,
  ChevronRight,
  Info,
  Pencil
} = window.BWPrototypeDependencies
function Note({ children }) {
  return <p className="ov-note">原型注释: {children}</p>
}
function Link({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children} ↗
    </a>
  )
}
function App() {
  const [scenario, setScenario] = useState(() => {
    const value = new URLSearchParams(location.search).get('scene')
    return scenarios.some((s) => s.id === value) ? value : 'during'
  })
  const [dialog, setDialog] = useState(null)
  const [filter, setFilter] = useState('全部')
  const [allTasks, setAllTasks] = useState(false)
  const [dark, setDark] = useState(false)
  const [sample, setSample] = useState(features)
  const [editing, setEditing] = useState('')
  const [edited, setEdited] = useState(false)
  const [editError, setEditError] = useState('')
  const selected = scenarios.find((s) => s.id === scenario)
  const unplanned = scenario === 'unplanned',
    history = scenario === 'delivered'
  const plan = history ? snapshot.priorPlan : snapshot.plan
  const acceptance = snapshot.acceptance
  const planLink = material(
    selected.version,
    'data',
    history ? acceptance.planRef.sourceCommit : undefined
  )
  const taskRows =
    filter === '已有结果'
      ? currentTasks.filter((t) => t.state === 'CLOSED')
      : filter === '全部'
        ? currentTasks
        : []
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])
  function native(route) {
    setDialog({ kind: 'native', title: `原型注释: ${route}入口`, route })
  }
  function openArtifact(feature, row) {
    setDialog({ kind: 'artifact', title: row[1], feature, row })
  }
  function openSession(feature) {
    setDialog({ kind: 'session', title: `工作会话 · #${feature.id}`, feature })
  }
  function edit() {
    setEditing(
      JSON.stringify(
        sample.map(({ id, title, owner, purpose, scope, later }) => ({
          id,
          title,
          owner,
          purpose,
          scope,
          later
        })),
        null,
        2
      )
    )
    setEditError('')
    setDialog({ kind: 'edit', title: '原型注释: 编辑本次预览' })
  }
  function applyEdits() {
    try {
      const next = JSON.parse(editing)
      if (
        !Array.isArray(next) ||
        next.length !== 2 ||
        next.some(
          (f, i) =>
            f.id !== features[i].id ||
            ['title', 'owner', 'purpose', 'scope', 'later'].some(
              (k) => typeof f[k] !== 'string' || !f[k].trim()
            )
        )
      ) {
        throw new Error('保留两个需求的 id，各文字字段不可为空。')
      }
      setSample(
        next.map((f, i) => ({
          ...features[i],
          ...Object.fromEntries(
            ['title', 'owner', 'purpose', 'scope', 'later'].map((k) => [k, f[k]])
          )
        }))
      )
      setEdited(true)
      setDialog(null)
    } catch (error) {
      setEditError(error.message)
    }
  }
  return (
    <div className="ov-app">
      <div className="review-bar">
        <strong>
          原型注释: #{334} · {revision}
        </strong>
        <select
          aria-label="版本生命周期情景"
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <a href="journey.html">意图与旅程 ↗</a>
        <div className="ov-tools">
          <IconAction
            icon={Pencil}
            label="原型注释: 编辑预览"
            disabled={scenario !== 'during'}
            onClick={edit}
          />
          <IconAction
            icon={Info}
            label="原型注释: 数据来源"
            onClick={() => setDialog({ kind: 'source', title: '原型注释: 数据来源' })}
          />
          <IconAction
            icon={BookOpen}
            label="原型注释: 设计参考"
            onClick={() => setDialog({ kind: 'references', title: '原型注释: 设计参考' })}
          />
          <button aria-label="原型注释: 切换明暗主题" onClick={() => setDark(!dark)}>
            {dark ? '浅色' : '深色'}
          </button>
        </div>
      </div>
      <div className="ov-shell">
        <aside className="ov-sidebar" aria-label="BW 项目与版本侧边栏">
          <div className="ov-brand">
            <LayoutDashboard size={22} />
            <span>Workbench</span>
          </div>
          <div className="ov-nav-group">
            <strong>Builder Workbench</strong>
          </div>
          <button className="nav-row" onClick={() => native('项目总览')}>
            <LayoutDashboard size={15} />
            项目总览
          </button>
          <button className="nav-row" onClick={() => native('知识库')}>
            <BookOpen size={15} />
            知识库
          </button>
          <hr />
          <div className="ov-nav-group">
            <span>版本</span>
            <button
              className="ov-sidebar-new"
              aria-label="新建版本"
              onClick={() => native('新建版本')}
            >
              ＋
            </button>
          </div>
          {scenarios.map((s) => (
            <div key={s.id}>
              <button
                className="nav-row"
                onClick={() => setScenario(s.id)}
                aria-expanded={scenario === s.id}
              >
                {scenario === s.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <strong>{s.version}</strong>
                <small>
                  {s.id === 'unplanned' ? '未制定计划' : s.id === 'during' ? '版本中' : '已归档'}
                </small>
              </button>
              {scenario === s.id && (
                <div className="ov-nav-sub">
                  <button
                    className="nav-row selected"
                    aria-current="page"
                    onClick={() => document.querySelector('.ov-main').scrollTo({ top: 0 })}
                  >
                    <LayoutDashboard size={15} />
                    总览
                  </button>
                  <button className="nav-row" onClick={() => native('版本计划')}>
                    <CalendarRange size={15} />
                    计划
                  </button>
                  <button className="nav-row" onClick={() => native('版本任务')}>
                    <ListTodo size={15} />
                    任务
                  </button>
                  {!unplanned && (
                    <div className="ov-nav-sub">
                      {plan.goals.map((g) => (
                        <button
                          className="nav-row ov-goal-nav"
                          title={g.title}
                          key={g.goalId}
                          onClick={() => setDialog({ kind: 'goal', title: g.title, goal: g })}
                        >
                          <ChevronRight size={12} />
                          <span>
                            {g.goalId} · {g.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <button className="nav-row" onClick={() => native('版本验收')}>
                    <ClipboardCheck size={15} />
                    验收
                  </button>
                  {!unplanned &&
                    !history &&
                    features.map((f) => (
                      <button className="ov-worktree" key={f.id} onClick={() => openSession(f)}>
                        <span>
                          <GitBranch size={14} />#{f.id} {f.title}
                        </span>
                        <small>本机任务分支 · 会话未读取</small>
                      </button>
                    ))}
                </div>
              )}
            </div>
          ))}
          <hr />
          <div className="ov-nav-group">项目工作区</div>
          <button className="ov-worktree" onClick={() => native('原生项目工作区')}>
            <span>
              <GitBranch size={14} />
              项目约定
            </span>
            <small>bw/project</small>
          </button>
          <button className="nav-row" onClick={() => native('其他项目')}>
            <ChevronRight size={14} />
            其他项目
          </button>
          <Note>
            沿用 BW
            导航与原生树卡片；版下树按任务关系展示，实际绑定、宿主与会话未读取，完整原生菜单不变。v0.9
            仅用于未制定计划情景，未创建真实版本。
          </Note>
        </aside>
        <main className="ov-main">
          <div className="ov-top">
            <span>Builder Workbench</span>
            <ChevronRight size={12} />
            <span>{selected.version}</span>
            <ChevronRight size={12} />
            <span>总览</span>
          </div>
          <div className="ov-content">
            <div className="ov-heading">
              <h1>{selected.version} 版本总览</h1>
              <span className="ov-chip">
                {unplanned ? '计划未制定' : history ? '已归档' : '版本中'}
              </span>
              <div className="ov-tools">
                <IconAction
                  icon={CalendarRange}
                  label="进入本版计划"
                  onClick={() => native('版本计划')}
                />
                <IconAction
                  icon={ListTodo}
                  label="进入本版任务"
                  onClick={() => native('版本任务')}
                />
                <IconAction
                  icon={ClipboardCheck}
                  label="进入本版验收"
                  onClick={() => native('版本验收')}
                />
              </div>
            </div>
            {unplanned ? (
              <>
                <div className="ov-empty-plan">
                  <CalendarRange size={32} />
                  <h2>先明确这一版要交付什么</h2>
                  <p>
                    计划尚未制定。目标、负责人、交付范围和关联任务会随计划保存逐步出现；未确认的内容保持草案身份。
                  </p>
                  <button className="ov-primary" onClick={() => native('版本计划')}>
                    开始制定版本计划
                  </button>
                </div>
                <section className="ov-section">
                  <SectionTitle id="previous" title="从上一版继续" extra="已有承诺与遗留可供参考" />
                  <button className="ov-link" onClick={() => setScenario('during')}>
                    查看 v0.8 的目标与当前成果 ↗
                  </button>
                  <p className="muted">
                    沿用已有版本计划旅程，上一版的未完成事项由人决定是否纳入新计划。
                  </p>
                </section>
                <Note>
                  这是尚未制定计划的布局示例；没有写入版本、材料或任务。点击“开始制定版本计划”查看原有计划入口的衔接。
                </Note>
              </>
            ) : (
              <>
                <div className="ov-meta">
                  <span>
                    负责人 ·{' '}
                    {[
                      ...new Set(
                        plan.goals.flatMap((g) =>
                          g.owner.split(/[;；]/).map((owner) => owner.trim())
                        )
                      )
                    ].join('、')}
                  </span>
                  <span>{history ? '人工验收 · 2026-10-23' : '计划确认 · 2026-10-27'}</span>
                  <span>交付时间 · {history ? '见验收与发布记录' : '计划未记录'}</span>
                  <Link href={planLink}>计划依据</Link>
                </div>
                {edited && !history && (
                  <Note>当前范围含临时编辑；刷新还原，不会改写真实计划或历史验收。</Note>
                )}
                <div className="ov-intro">
                  <div>
                    <span className="ov-label">{history ? '当时承诺' : '本版承诺'}</span>
                    <div className="ov-goal-summary">
                      {plan.goals.map((g) => (
                        <button
                          key={g.goalId}
                          onClick={() => setDialog({ kind: 'goal', title: g.title, goal: g })}
                        >
                          <span>{g.goalId}</span>
                          {g.title}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="ov-label">
                      {history ? '当时交付与人工结论' : '目前形成的成果'}
                    </span>
                    {history ? (
                      <>
                        <p>
                          正式验收记录：
                          {acceptance.results
                            .filter((r) => r.decision?.outcome === 'not-met')
                            .map((r) => r.goalId)
                            .join('、')}{' '}
                          未达成；
                          {acceptance.results
                            .filter((r) => r.decision?.outcome === 'met')
                            .map((r) => r.goalId)
                            .join('、')}{' '}
                          达成。
                        </p>
                        <p>已记录 v0.7.0 候选包及验收环境；后续修理不改写当时结论。</p>
                        <Link href={material('v0.7', 'acceptance')}>查看正式验收依据</Link>
                      </>
                    ) : (
                      <>
                        <p>两个总览已有设计 Draft PR，正在结合评审反馈修改。</p>
                        <p>
                          日常任务 {currentTasks.filter((t) => t.state === 'OPEN').length} 项开放、
                          {currentTasks.filter((t) => t.state === 'CLOSED').length}{' '}
                          项已关闭。会话执行状态尚未读取。
                        </p>
                        <button
                          className="ov-link"
                          onClick={() => setDialog({ kind: 'review', title: '待审成果' })}
                        >
                          查看待审成果 ↗
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {history ? (
                  <>
                    <section className="ov-section">
                      <SectionTitle
                        id="acceptance"
                        title="正式验收"
                        extra="固定当时计划与人工结论"
                      />
                      <div className="ov-table-scroll">
                        <table className="ov-task-table">
                          <thead>
                            <tr>
                              <th>目标</th>
                              <th>人工结论</th>
                              <th>后续处理</th>
                            </tr>
                          </thead>
                          <tbody>
                            {plan.goals.map((g) => {
                              const result = acceptance.results.find((r) => r.goalId === g.goalId)
                              return (
                                <tr key={g.goalId}>
                                  <td>
                                    <strong>
                                      {g.goalId} · {g.title}
                                    </strong>
                                    <small>{g.owner}</small>
                                  </td>
                                  <td>
                                    {result?.decision?.outcome === 'met'
                                      ? '达成'
                                      : result?.decision?.outcome === 'not-met'
                                        ? '未达成'
                                        : '尚未确认'}
                                  </td>
                                  <td>
                                    {result?.nextStep || '未记录补充说明'}
                                    {result?.issueNotes &&
                                      Object.values(result.issueNotes).map((n, i) => (
                                        <small key={i}>{n}</small>
                                      ))}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </section>
                    <section className="ov-section">
                      <SectionTitle
                        id="release"
                        title="交付依据与后续修理"
                        extra="当时验收与后续发布分别保留"
                      />
                      <p>
                        验收候选：Workbench {acceptance.candidateRef.version} ·{' '}
                        <Link href={`${repository}/commit/${acceptance.candidateRef.commit}`}>
                          {acceptance.candidateRef.commit.slice(0, 8)}
                        </Link>
                      </p>
                      <p>{acceptance.demoEnv.detail}</p>
                      <div className="ov-records">
                        <Link href={`${repository}/releases/tag/v0.7.0`}>v0.7.0 发布</Link>
                        <Link
                          href={`${repository}/blob/${snapshot.source.sourceCommit}/.bw/planning/v0.7/acceptance-evidence.html`}
                        >
                          当时验收报告
                        </Link>
                        <Link href={`${repository}/pull/429`}>归档 PR #429</Link>
                      </div>
                      <p className="muted">
                        后续补丁：
                        {snapshot.releases
                          .filter((r) => /^v0\.7\.[1-9]/.test(r.tagName))
                          .map((r) => (
                            <React.Fragment key={r.tagName}>
                              <Link href={r.url}>{r.tagName}</Link>
                              {' · '}
                            </React.Fragment>
                          ))}
                      </p>
                      <button className="ov-link" onClick={() => setScenario('during')}>
                        进入 v0.8 查看后续承担 ↗
                      </button>
                    </section>
                  </>
                ) : (
                  <>
                    <section className="ov-section">
                      <SectionTitle
                        id="features"
                        title="大需求与本版交付"
                        extra="G2 · 两个总览各自推进"
                      />
                      {sample.map((f) => (
                        <Feature
                          key={f.id}
                          feature={f}
                          openArtifact={openArtifact}
                          openSession={openSession}
                        />
                      ))}
                    </section>
                    <section className="ov-section">
                      <SectionTitle
                        id="trial"
                        title="MVP 试用与后续完善"
                        extra="使用范围与代码合入分别核对"
                      />
                      <div className="ov-trial">
                        <div>
                          <strong>本版试用交付尚未记录</strong>
                          <p>
                            尚未找到 v0.8
                            的候选包、试用人群与使用反馈。两个总览目前提供的是可评审设计。
                          </p>
                          <button
                            className="ov-link"
                            onClick={() => setDialog({ kind: 'trial', title: '试用交付依据' })}
                          >
                            查看需要补齐的依据 ↗
                          </button>
                        </div>
                        <div>
                          <strong>问题继续进入 Issue</strong>
                          <p>
                            实际反馈分别进入本版修理、后续版本候选或持续改善。范围由下一次计划确认。
                          </p>
                          <Link href={`${repository}/issues/421`}>#421 更新下载中断与续传</Link>
                          <br />
                          <Link href={`${repository}/issues/432`}>#432 计划 / 验收 Issue 回显</Link>
                        </div>
                      </div>
                    </section>
                    <section className="ov-section">
                      <SectionTitle
                        id="workflow"
                        title="小需求 / bug"
                        extra="G4 · Issue 与原生会话分别取据"
                      />
                      <div className="ov-filters">
                        {['全部', '执行中', '待处理', '已有结果'].map((f) => (
                          <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                            {f}
                          </button>
                        ))}
                      </div>
                      {filter === '执行中' || filter === '待处理' ? (
                        <div className="ov-empty">
                          <strong>会话状态未知</strong>
                          <p>
                            尚未读取原生会话，无法判断哪些正在执行或等待输入。Issue
                            开放不代表待处理。
                          </p>
                          <Note>
                            这里只读了 Git / GitHub；未访问或操控日常 BW。真实实现沿已有会话
                            workflow 读取。
                          </Note>
                        </div>
                      ) : (
                        <>
                          <div className="ov-table-scroll">
                            <table className="ov-task-table">
                              <thead>
                                <tr>
                                  <th>任务</th>
                                  <th>执行会话</th>
                                  <th>Issue</th>
                                  <th>成果 / 处理依据</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(allTasks ? taskRows : taskRows.slice(0, 5)).map((t) => (
                                  <tr key={t.number}>
                                    <td>
                                      <button
                                        onClick={() =>
                                          setDialog({
                                            kind: 'task',
                                            title: shortTitle(t.title),
                                            task: t
                                          })
                                        }
                                      >
                                        {shortTitle(t.title)}
                                      </button>
                                      <small>#{t.number}</small>
                                    </td>
                                    <td>
                                      未知<small>尚未读取</small>
                                    </td>
                                    <td>
                                      {issueState(t)}
                                      <small>
                                        {t.state === 'CLOSED'
                                          ? t.stateReason === 'COMPLETED'
                                            ? '完成后关闭'
                                            : '关闭原因见 Issue'
                                          : '以 Issue 原生状态为准'}
                                      </small>
                                    </td>
                                    <td>
                                      <button
                                        className="ov-link"
                                        onClick={() =>
                                          setDialog({
                                            kind: 'task',
                                            title: shortTitle(t.title),
                                            task: t
                                          })
                                        }
                                      >
                                        查看 Issue 与 PR 依据 ↗
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {taskRows.length > 5 && (
                            <button className="ov-link" onClick={() => setAllTasks(!allTasks)}>
                              {allTasks ? '收起' : `展开全部 ${taskRows.length} 项`} ↗
                            </button>
                          )}
                        </>
                      )}
                    </section>
                  </>
                )}
                <section className="ov-section">
                  <SectionTitle
                    id="records"
                    title="本版记录"
                    extra="计划、过程评审与正式验收分别保留"
                  />
                  <div className="ov-records">
                    <Link href={planLink}>计划与纪要</Link>
                    {!history && (
                      <button onClick={() => setDialog({ kind: 'review', title: '待审成果' })}>
                        规格 / 原型评审 ↗
                      </button>
                    )}
                    <button onClick={() => native('版本验收')}>正式验收 ↗</button>
                    <Link href={`${repository}/pull/${history ? 429 : 446}`}>归档 PR</Link>
                    {history && <Link href={`${repository}/releases/tag/v0.7.0`}>发布依据</Link>}
                  </div>
                </section>
                <Note>
                  本页采用 BW 真实材料与 GitHub 快照（
                  {snapshot.source.checkedAt.slice(0, 16).replace('T', ' ')}{' '}
                  UTC），不持续联网刷新。未合入设计和已归档承诺分开；会话与新版本试用未读取。原生页面、宿主和菜单能力沿用，仅本版总览重设计。
                </Note>
              </>
            )}
          </div>
        </main>
      </div>
      {dialog && (
        <Dialog
          title={dialog.title}
          close={() => setDialog(null)}
          wide={dialog.kind === 'source' || dialog.kind === 'edit'}
        >
          {dialog.kind === 'references' && <ReferencePanel />}
          {dialog.kind === 'source' && <SourcePanel />}
          {dialog.kind === 'goal' && (
            <>
              <p>
                <strong>
                  {dialog.goal.goalId} · {dialog.goal.owner}
                </strong>
              </p>
              <h3>交付范围</h3>
              <p className="ov-prewrap">{dialog.goal.deliverable}</p>
              <h3>验收依据</h3>
              <p className="ov-prewrap">{dialog.goal.acceptance}</p>
              <h3>关联任务</h3>
              <div className="ov-records">
                {plan.tasks
                  .filter((t) => t.goalId === dialog.goal.goalId)
                  .map((t) => (
                    <Link href={`${repository}/issues/${t.number}`} key={t.number}>
                      #{t.number}
                    </Link>
                  ))}
              </div>
              <Link href={planLink}>固定计划原文</Link>
            </>
          )}
          {dialog.kind === 'review' && (
            <>
              {sample.map((f) => (
                <div className="ov-review-item" key={f.id}>
                  <strong>{f.title}</strong>
                  <p>意图、规格、旅程与高保真修订待人确认。</p>
                  <button className="ov-link" onClick={() => openArtifact(f, f.artifacts[1])}>
                    打开设计成果 ↗
                  </button>
                  {' · '}
                  <Link href={f.pr.url}>PR #{f.pr.number}</Link>
                </div>
              ))}
            </>
          )}
          {dialog.kind === 'artifact' && (
            <>
              <span className="ov-chip">{dialog.row[2]}</span>
              <p>{dialog.row[3]}</p>
              <dl>
                <dt>需求</dt>
                <dd>
                  <Link href={`${repository}/issues/${dialog.feature.id}`}>
                    #{dialog.feature.id}
                  </Link>
                </dd>
                <dt>来源</dt>
                <dd>{dialog.row[3]}</dd>
              </dl>
              {dialog.row[5] ? (
                <Link href={dialog.row[5]}>打开成果</Link>
              ) : (
                <p>尚未记录可打开的成果，不能据此推断已完成。</p>
              )}
              {dialog.row[4] === 'design' && (
                <p>
                  <Link
                    href={
                      dialog.feature.id === '334'
                        ? 'prototype.html'
                        : `${repository}/blob/${dialog.feature.pr.headRefOid}/docs/05-features/overview-metrics/prototype.html`
                    }
                  >
                    高保真原型
                  </Link>
                  {' · '}
                  <Link
                    href={
                      dialog.feature.id === '334'
                        ? 'journey.html'
                        : `${repository}/blob/${dialog.feature.pr.headRefOid}/docs/05-features/overview-metrics/spec.md`
                    }
                  >
                    旅程与规格
                  </Link>
                </p>
              )}
              <p>
                <button className="ov-link" onClick={() => openSession(dialog.feature)}>
                  继续原生工作会话 ↗
                </button>
              </p>
              {dialog.row[4] === 'test' && (
                <Note>CI 对应上面标明的已提交修订，不代表当前本地改稿或用户可用性已通过验证。</Note>
              )}
            </>
          )}
          {dialog.kind === 'session' && (
            <>
              <dl>
                <dt>任务</dt>
                <dd>
                  #{dialog.feature.id} · {dialog.feature.title}
                </dd>
                <dt>本机 Git 分支</dt>
                <dd>
                  {dialog.feature.id === '334'
                    ? 'yuzhup/issue-334-v0.8-g2-sdlc'
                    : 'yuzhup/issue-440-v0.8-g2'}
                </dd>
                <dt>原生会话</dt>
                <dd>尚未读取</dd>
              </dl>
              <Note>
                工作树分支已核对，不能由 Git 推断 BW
                宿主登记或会话状态。落地沿原有工作树激活和任务开工：唯一匹配直接进入，多实例按宿主选择，无匹配进入原生创建器。本原型不创建或激活工作树。
              </Note>
              <Link href="../version-workspace/version-workspace-prototype.html?rev=439-feedback">
                查看现有原生入口衔接
              </Link>
            </>
          )}
          {dialog.kind === 'task' && (
            <>
              <p>
                #{dialog.task.number} · {issueState(dialog.task)}
              </p>
              <p>原生会话：未知；可用性：尚未核对发布或试用依据。</p>
              <Link href={dialog.task.url}>打开原生 Issue</Link>
              <p>
                <button
                  className="ov-primary"
                  onClick={() =>
                    setDialog({
                      kind: 'task-session',
                      title: `原型注释: 原生任务开工 · #${dialog.task.number}`,
                      task: dialog.task
                    })
                  }
                >
                  继续处理此任务
                </button>
              </p>
              <h3>Issue 时间线中的 PR 线索</h3>
              <p className="muted">
                提及关系供继续核对；不能单凭 PR 出现或合入认定这个问题已解决。
              </p>
              {dialog.task.pullRequests
                .filter((p) => p.number !== 446)
                .map((p) => (
                  <p key={p.number}>
                    <Link href={p.url}>
                      #{p.number} {p.title}
                    </Link>{' '}
                    · {prState(p)}
                  </p>
                ))}
              {dialog.task.pullRequests.filter((p) => p.number !== 446).length === 0 && (
                <p>当前读取范围内未发现实施 PR。</p>
              )}
              <Note>
                来源为该 Issue 最近 12 条交叉引用，排除本版计划归档 PR；不是完整 PR
                发现或自动归因协议。
              </Note>
            </>
          )}
          {dialog.kind === 'task-session' && (
            <>
              <dl>
                <dt>任务来源</dt>
                <dd>GitHub · github.com/forcegravity1989/builder-workbench</dd>
                <dt>任务</dt>
                <dd>
                  #{dialog.task.number} · {shortTitle(dialog.task.title)}
                </dd>
                <dt>版本 / 目标</dt>
                <dd>v0.8 / G4</dd>
                <dt>会话与工作树</dt>
                <dd>尚未读取原生登记</dd>
              </dl>
              <Note>
                携带上述完整 Issue
                引用，复用当前任务开工与工作区选择：已有匹配工作区则进入，多个实例按宿主选择，无匹配才进入原生创建器。这里不猜测已有会话，不执行建树或发送消息。
              </Note>
              <Link href="../version-workspace/version-workspace-prototype.html?rev=439-feedback">
                查看既有任务入口与创建器样式
              </Link>
            </>
          )}
          {dialog.kind === 'trial' && (
            <>
              <p>
                候选包 / 部署、对应提交、可用范围、试用人群、已验证边界、已知问题及反馈 Issue
                尚未形成完整记录。
              </p>
              <p>
                当前设计目标允许先供部分用户使用，再通过后续 B
                版本修理完善。试用反馈和规格评审不增加正式版本验收次数。
              </p>
              <Note>此处展示缺证据时的真实空态，不用现有 v0.7 发布包冒充 v0.8 MVP。</Note>
            </>
          )}
          {dialog.kind === 'native' && (
            <>
              <Note>
                沿用当前 BW 的「{dialog.route}」，带入 Builder Workbench{' '}
                {dialog.route === '新建版本' ? '项目' : `/ ${selected.version}`}{' '}
                上下文。此处保留原入口与旅程，真实会话和页面由现有能力承接；不会启动或操控日常 BW。
              </Note>
              <div className="ov-native-placeholder">
                <strong>{dialog.route} · 原有界面不变</strong>
                <p>
                  {dialog.route === '新建版本'
                    ? '项目与版本名 → 原生准备计划 / 验收树 → 进入计划短开始卡'
                    : dialog.route === '版本计划'
                      ? '计划短开始卡 → 原生会话与计划板 → 人工确认 → 归档 PR'
                      : dialog.route === '版本验收'
                        ? '验收短开始卡 → 候选与固定计划 → 一次正式人工验收 → 归档'
                        : '项目、版本、任务与工作会话沿现有壳导航。'}
                </p>
              </div>
              {dialog.route === '版本计划' && (
                <Link href="../version-planning/planning-journey-prototype.html">
                  打开已有计划高保真
                </Link>
              )}
              {dialog.route === '版本验收' && (
                <Link href="../version-acceptance/acceptance-journey-prototype.html">
                  打开已有验收高保真
                </Link>
              )}
              {dialog.route === '项目总览' && (
                <Link href={`${repository}/pull/460`}>项目总览设计 PR #460</Link>
              )}
              {!['版本计划', '版本验收', '项目总览'].includes(dialog.route) && (
                <Link href="../version-workspace/version-workspace-prototype.html?rev=439-feedback">
                  打开现有壳与任务开工原型
                </Link>
              )}
            </>
          )}
          {dialog.kind === 'edit' && (
            <>
              <Note>
                只改本次浏览器预览，刷新还原；不写计划、Issue
                或评审批注。历史版本使用固定材料，不受这里修改影响。
              </Note>
              <textarea
                aria-label="预览内容 JSON"
                value={editing}
                onChange={(e) => setEditing(e.target.value)}
              />
              {editError && <p role="alert">{editError}</p>}
              <button className="ov-primary" onClick={applyEdits}>
                应用到预览
              </button>
            </>
          )}
        </Dialog>
      )}
    </div>
  )
}
createRoot(document.getElementById('root')).render(<App />)
