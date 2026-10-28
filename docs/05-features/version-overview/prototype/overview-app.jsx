import { OverviewSections, ProductivityEvidence } from './overview-sections.jsx'
import { IconAction } from '../../version-workspace/prototype/g2-icon-action.jsx'
import { Dialog, SourcePanel, ReferencePanel } from './overview-components.jsx'
import {
  snapshot,
  repository,
  revision,
  scenarios,
  features,
  historicalFeatures,
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
  useRef,
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
  const [allTasks, setAllTasks] = useState(false)
  const [dark, setDark] = useState(false)
  const [sample, setSample] = useState(features)
  const [editing, setEditing] = useState('')
  const [edited, setEdited] = useState(false)
  const [editError, setEditError] = useState('')
  const [focusRequest, setFocusRequest] = useState(() => {
    const id = new URLSearchParams(location.search).get('focus')
    return ['334', '440', '383'].includes(id) ? { id, sequence: 0 } : null
  })
  const [navigationDraft, setNavigationDraft] = useState({
    origin: 'project',
    scene: 'during',
    featureId: '334',
    note: ''
  })
  const [returnContext, setReturnContext] = useState(null)
  const mainRef = useRef(null)
  const selected = scenarios.find((s) => s.id === scenario)
  const unplanned = scenario === 'unplanned',
    history = scenario === 'delivered'
  const plan = history ? snapshot.priorPlan : snapshot.plan
  const acceptance = snapshot.acceptance
  const requirements = unplanned ? [] : history ? historicalFeatures : sample
  const missingFocus = focusRequest && !requirements.some((f) => f.id === focusRequest.id)
  const planLink = material(
    selected.version,
    'data',
    history ? acceptance.planRef.sourceCommit : undefined
  )
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])
  function native(route) {
    setDialog({ kind: 'native', title: `原型注释: ${route}入口`, route })
  }
  function openVersion(scene, id = null) {
    setScenario(scene)
    setAllTasks(false)
    setDialog(null)
    setFocusRequest(id ? { id, sequence: (focusRequest?.sequence || 0) + 1 } : null)
    mainRef.current?.scrollTo({ top: 0 })
  }
  function enterFromSource() {
    setReturnContext({ ...navigationDraft })
    openVersion(navigationDraft.scene, navigationDraft.featureId)
  }
  function returnToSource() {
    setNavigationDraft({ ...returnContext })
    setDialog({ kind: 'navigation', title: '原型注释: 返回来源上下文', returned: true })
  }
  function openArtifact(feature, row) {
    if (row[4] === 'issues') {
      setDialog({ kind: 'goal-tasks', title: '本版目标关联任务', feature })
      return
    }
    setDialog({ kind: 'artifact', title: row[1], feature, row })
  }
  function openSession(feature) {
    if (feature.historical) {
      native('历史任务与会话')
      return
    }
    setDialog({ kind: 'session', title: `工作会话 · #${feature.id}`, feature })
  }
  function edit() {
    setEditing(
      JSON.stringify(
        sample.map(({ id, title, owner, purpose, scope }) => ({
          id,
          title,
          owner,
          purpose,
          scope
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
            ['title', 'owner', 'purpose', 'scope'].some(
              (k) => typeof f[k] !== 'string' || !f[k].trim()
            )
        )
      ) {
        throw new Error('保留两个需求的 id，各文字字段不可为空。')
      }
      setSample(
        next.map((f, i) => ({
          ...features[i],
          ...Object.fromEntries(['title', 'owner', 'purpose', 'scope'].map((k) => [k, f[k]]))
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
          onChange={(e) => {
            openVersion(e.target.value)
          }}
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <a href="journey.html">意图与旅程 ↗</a>
        <button
          className="ov-demo-navigation"
          onClick={() => setDialog({ kind: 'navigation', title: '原型注释: 从来源进入版本' })}
        >
          原型注释: 来源导航
        </button>
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
                onClick={() => openVersion(s.id)}
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
        <main className="ov-main" ref={mainRef}>
          <div className="ov-top">
            <span>Builder Workbench</span>
            <ChevronRight size={12} />
            <span>{selected.version}</span>
            <ChevronRight size={12} />
            <span>总览</span>
            {returnContext && (
              <button className="ov-return" onClick={returnToSource}>
                ← {returnContext.origin === 'planning' ? '返回规划工作区' : '返回项目总览'}
              </button>
            )}
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
            {!unplanned && (
              <div className="ov-meta">
                <span>
                  负责人 ·{' '}
                  {[
                    ...new Set(
                      plan.goals.flatMap((g) => g.owner.split(/[;；]/).map((o) => o.trim()))
                    )
                  ].join('、')}
                </span>
                <span>{history ? '人工验收 · 2026-10-23' : '计划确认 · 2026-10-27'}</span>
                <span>交付时间 · {history ? '见验收与发布记录' : '计划未记录'}</span>
                <Link href={planLink}>计划依据</Link>
              </div>
            )}
            {edited && !history && !unplanned && (
              <Note>当前范围含临时编辑，刷新还原；历史记录不受影响。</Note>
            )}
            {missingFocus && (
              <div className="ov-focus-missing" role="status">
                <Link href={`${repository}/issues/${focusRequest.id}`}>
                  来源需求 #{focusRequest.id}
                </Link>
                <span>
                  {unplanned
                    ? '本版尚未制定计划，未确认该需求的本版范围'
                    : '已读取的本版计划中未发现该需求关联'}
                </span>
              </div>
            )}
            <OverviewSections
              selected={selected}
              unplanned={unplanned}
              history={history}
              plan={plan}
              planLink={planLink}
              sample={sample}
              setDialog={setDialog}
              native={native}
              openArtifact={openArtifact}
              openSession={openSession}
              allTasks={allTasks}
              setAllTasks={setAllTasks}
              focusRequest={focusRequest}
              openVersion={openVersion}
            />
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
          {dialog.kind === 'navigation' && (
            <>
              <Note>
                这里只演示 #334 的进入、需求定位和返回上下文，不复刻 #440
                页面。以下输入仅保留在本页内存，刷新清除；不是共享路由或存储协议。
              </Note>
              <div className="ov-navigation-fields">
                <label>
                  原型注释: 来源页面
                  <select
                    value={navigationDraft.origin}
                    onChange={(e) =>
                      setNavigationDraft({ ...navigationDraft, origin: e.target.value })
                    }
                  >
                    <option value="project">项目总览</option>
                    <option value="planning">规划工作区</option>
                  </select>
                </label>
                <label>
                  原型注释: 目标版本
                  <select
                    value={navigationDraft.scene}
                    onChange={(e) =>
                      setNavigationDraft({ ...navigationDraft, scene: e.target.value })
                    }
                  >
                    {scenarios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.version}
                        {s.id === 'unplanned' ? '（未计划示例）' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  原型注释: 来源需求
                  <select
                    value={navigationDraft.featureId}
                    onChange={(e) =>
                      setNavigationDraft({ ...navigationDraft, featureId: e.target.value })
                    }
                  >
                    <option value="334">#334 版本总览</option>
                    <option value="440">#440 项目总览</option>
                    <option value="383">#383 版本工作区</option>
                  </select>
                </label>
              </div>
              {navigationDraft.origin === 'planning' && (
                <label>
                  原型注释: 来源草案输入示例（不会写入版本计划）
                  <textarea
                    value={navigationDraft.note}
                    onChange={(e) =>
                      setNavigationDraft({ ...navigationDraft, note: e.target.value })
                    }
                    placeholder="输入一段文字，进入版本后返回，核对示例输入仍保留"
                  />
                </label>
              )}
              {dialog.returned && (
                <Note>
                  本地示例的来源选择和草案输入已保留；#440
                  真实页面的视口、规划草案和跨屏返回尚未联调。本屏不会修改来源页面材料。
                </Note>
              )}
              <p>
                <button className="ov-primary" onClick={enterFromSource}>
                  进入所选版本并定位需求
                </button>
              </p>
              <Note>
                版本按项目实际名称定位；不强制
                C/B，也不按日期推断所属关系。未纳入计划的来源需求仅作为定位上下文，不补造本版承诺。
              </Note>
            </>
          )}
          {dialog.kind === 'source' && <SourcePanel />}
          {dialog.kind === 'productivity' && <ProductivityEvidence focus={dialog.focus} />}
          {dialog.kind === 'workflow-evidence' && (
            <>
              <p>项目流程：workbench-start</p>
              <dl>
                <dt>使用情况</dt>
                <dd>待核对</dd>
                <dt>实际流程修订</dt>
                <dd>尚未读取</dd>
                <dt>会话依据</dt>
                <dd>尚未解析</dd>
              </dl>
              <Note>
                这里展示拟落地的执行依据。BW 开工已有任务、树与会话关联；仍需按会话核对实际使用的
                workflow，不能仅由项目里存在 Skill
                推断已使用。是否充分遵循流程与交付质量由下方生产力区域核对。
              </Note>
            </>
          )}
          {dialog.kind === 'goal-tasks' && (
            <>
              <p>
                {selected.version} · 目标 {dialog.feature.goalId}
              </p>
              <div className="ov-records">
                {plan.tasks
                  .filter((t) => t.goalId === dialog.feature.goalId)
                  .map((t) => (
                    <Link key={t.number} href={`${repository}/issues/${t.number}`}>
                      #{t.number}
                    </Link>
                  ))}
              </div>
              <Note>
                这里只聚合已关联目标的原生 Issue。反馈、新需求和 bug
                使用同一任务来源与计划关联，不另建反馈清单或两周分流规则。
              </Note>
            </>
          )}
          {dialog.kind === 'release' && (
            <>
              <p>
                验收候选：Workbench {acceptance.candidateRef.version} ·{' '}
                <Link href={`${repository}/commit/${acceptance.candidateRef.commit}`}>
                  {acceptance.candidateRef.commit.slice(0, 8)}
                </Link>
              </p>
              <p>{acceptance.demoEnv.detail}</p>
              <Link
                href={`${repository}/blob/${snapshot.source.sourceCommit}/.bw/planning/v0.7/acceptance-evidence.html`}
              >
                当时验收报告
              </Link>
              <h3>后续补丁</h3>
              {snapshot.releases
                .filter((r) => /^v0\.7\.[1-9]/.test(r.tagName))
                .map((r) => (
                  <p key={r.tagName}>
                    <Link href={r.url}>{r.tagName}</Link>
                  </p>
                ))}
            </>
          )}
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
              {history && (
                <>
                  <h3>当时人工结论</h3>
                  {acceptance.results
                    .filter((r) => r.goalId === dialog.goal.goalId)
                    .map((r) => (
                      <div key={r.goalId}>
                        <p>
                          {r.decision?.outcome === 'met'
                            ? '达成'
                            : r.decision?.outcome === 'not-met'
                              ? '未达成'
                              : '未确认'}{' '}
                          · {r.decision?.source}
                        </p>
                        <p>{r.nextStep}</p>
                        {Object.values(r.issueNotes || {}).map((note, i) => (
                          <p key={i}>{note}</p>
                        ))}
                      </div>
                    ))}
                </>
              )}
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
                  <button
                    className="ov-link"
                    onClick={() =>
                      openArtifact(
                        f,
                        f.artifacts.find((row) => row[4] === 'prototype')
                      )
                    }
                  >
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
                <p>暂无可打开的成果。</p>
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
                #{dialog.task.number} ·{' '}
                {dialog.task.historical ? '历史处理状态未归档' : issueState(dialog.task)}
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
              {dialog.task.historical ? (
                <>
                  <h3>历史 PR 依据</h3>
                  <p>当时 PR 关联未归档，本轮未读取。</p>
                  <Note>
                    此处只补读了任务名称，没有查询这些历史任务的 PR
                    时间线，也不以现在的关联重写当时结果。
                  </Note>
                </>
              ) : (
                <>
                  <h3>Issue 时间线中的 PR 线索</h3>
                  <p className="muted">
                    提及关系供继续核对；不能单凭 PR 出现或合入认定这个问题已解决。
                  </p>
                  {(dialog.task.pullRequests || [])
                    .filter((p) => p.number !== 446)
                    .map((p) => (
                      <p key={p.number}>
                        <Link href={p.url}>
                          #{p.number} {p.title}
                        </Link>{' '}
                        · {prState(p)}
                      </p>
                    ))}
                  {(dialog.task.pullRequests || []).filter((p) => p.number !== 446).length ===
                    0 && <p>当前读取范围内未发现实施 PR。</p>}
                  <Note>
                    来源为该 Issue 最近 12 条交叉引用，排除本版计划归档 PR；不是完整 PR
                    发现或自动归因协议。
                  </Note>
                </>
              )}
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
                <dd>
                  {selected.version} / {dialog.task.goalId}
                </dd>
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
              {editError && (
                <p className="ov-error" role="alert">
                  {editError}
                </p>
              )}
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
