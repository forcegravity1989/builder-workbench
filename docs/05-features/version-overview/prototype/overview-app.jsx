import { OverviewSections } from './overview-sections.jsx'
import { IconAction } from '../../version-workspace/prototype/g2-icon-action.jsx'
import { Dialog, SourcePanel, ReferencePanel } from './overview-components.jsx'
import {
  snapshot,
  archivePull,
  formatTime,
  repository,
  revision,
  scenarios,
  features,
  historicalFeatures,
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
  RefreshCw,
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
function ArchiveStamp({ version, workflow, label }) {
  const pull = archivePull(version, workflow)
  const merged = pull?.state === 'MERGED'
  return (
    <span>
      {label} ·{' '}
      {merged && pull.mergedAt ? (
        <time dateTime={pull.mergedAt} title="北京时间 UTC+08:00">
          {formatTime(pull.mergedAt)}
        </time>
      ) : pull && !merged ? (
        '未合入'
      ) : (
        '未记录'
      )}
      {pull && (
        <>
          {' '}
          · <Link href={pull.url}>#{pull.number}</Link>
        </>
      )}
    </span>
  )
}
function App() {
  const [scenario, setScenario] = useState(() => {
    const value = new URLSearchParams(location.search).get('scene')
    return scenarios.some((s) => s.id === value) ? value : 'during'
  })
  const [dialog, setDialog] = useState(null)
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
    featureId: '',
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
  function native(route, goal = null, feature = null) {
    setDialog({ kind: 'native', title: `原型注释: ${route}入口`, route, goal, feature })
  }
  function openVersion(scene, id = null) {
    setScenario(scene)
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
  function refreshVersion() {
    const url = new URL(location.href)
    url.searchParams.set('scene', scenario)
    if (focusRequest) {
      url.searchParams.set('focus', focusRequest.id)
    } else {
      url.searchParams.delete('focus')
    }
    location.assign(url)
  }
  function openSession(feature) {
    if (feature.historical) {
      native('历史任务与会话', null, feature)
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
        throw new Error('保留两个特性的 id，各文字字段不可为空。')
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
                          onClick={() => native('目标任务', g)}
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
                <IconAction icon={RefreshCw} label="刷新版本数据" onClick={refreshVersion} />
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
                <ArchiveStamp version={selected.version} workflow="planning" label="计划 PR 合入" />
                <ArchiveStamp
                  version={selected.version}
                  workflow="acceptance"
                  label="验收 PR 合入"
                />
              </div>
            )}
            {edited && !history && !unplanned && (
              <Note>当前范围含临时编辑，刷新还原；历史记录不受影响。</Note>
            )}
            {missingFocus && (
              <div className="ov-focus-missing" role="status">
                <Link href={`${repository}/issues/${focusRequest.id}`}>
                  来源特性 #{focusRequest.id}
                </Link>
                <span>
                  {unplanned
                    ? '本版尚未制定计划，未确认该特性的本版范围'
                    : '已读取的本版计划中未发现该特性关联'}
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
                  原型注释: 来源特性（有明确关系时）
                  <select
                    value={navigationDraft.featureId}
                    onChange={(e) =>
                      setNavigationDraft({ ...navigationDraft, featureId: e.target.value })
                    }
                  >
                    <option value="">仅进入版本（未关联特性）</option>
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
                  {navigationDraft.featureId ? '进入所选版本并定位特性' : '进入所选版本'}
                </button>
              </p>
              <Note>
                版本按项目实际名称定位；不强制
                C/B，也不按日期推断所属关系。从项目总览版本表头进入时可仅带版本；有明确特性关系才定位。
                未纳入计划的来源特性仅作为定位上下文，不补造本版承诺。
              </Note>
            </>
          )}
          {dialog.kind === 'source' && <SourcePanel />}
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
          {dialog.kind === 'native' && (
            <>
              <Note>
                沿用当前 BW 的「{dialog.route}」，带入 Builder Workbench{' '}
                {dialog.route === '新建版本' ? '项目' : `/ ${selected.version}`}{' '}
                上下文。此处保留原入口与旅程，真实会话和页面由现有能力承接；不会启动或操控日常 BW。
              </Note>
              {dialog.goal && (
                <p>
                  当前定位：{selected.version} / {dialog.goal.goalId} · {dialog.goal.title}
                </p>
              )}
              {dialog.feature && (
                <>
                  <p>
                    历史任务定位：{selected.version} / {dialog.feature.goalId} / #
                    {dialog.feature.id} · {dialog.feature.title}
                  </p>
                  <p>原生会话：尚未读取</p>
                </>
              )}
              <div className="ov-native-placeholder">
                <strong>{dialog.route} · 原有界面不变</strong>
                <p>
                  {dialog.route === '新建版本'
                    ? '项目与版本名 → 原生准备计划 / 验收树 → 进入计划短开始卡'
                    : dialog.route === '版本计划'
                      ? '计划短开始卡 → 原生会话与计划板 → 人工确认 → 归档 PR'
                      : dialog.route === '版本验收'
                        ? '验收短开始卡 → 候选与固定计划 → 一次正式人工验收 → 归档'
                        : dialog.route === '目标任务'
                          ? '沿用本版本／目标的原生任务屏，目标上下文已带入；总览不重复维护任务列表。'
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
