import snapshot from './g2-plan-snapshot.json'
import snapshotV06 from './g2-plan-v06-snapshot.json'
import issueSnapshot from './g2-issue-snapshot.json'
import { ScopedTasks, SharedIssueDetail } from './g2-tasks.jsx'
import { VersionOverview } from './g2-version-overview.jsx'
import { ExistingProjectOverview } from './g2-existing-overview.jsx'

const {
  React,
  useState,
  useRef,
  useEffect,
  createRoot,
  LayoutDashboard,
  CalendarRange,
  ClipboardCheck,
  CalendarClock,
  BookOpen,
  GitBranch,
  MessageSquare,
  Plus,
  ChevronDown,
  ChevronRight,
  Target,
  ListTodo,
  GitPullRequest,
  ArrowRight,
  X,
  Info,
  Check,
  ExternalLink,
  PackageCheck
} = window.BWPrototypeDependencies

const issues = issueSnapshot.items
const emptyPlan = { goals: [], tasks: [], summary: {} }
const plans = { 'v0.7': snapshot, 'v0.6': snapshotV06 }
const versionOrder = ['v0.8', 'v0.7', 'v0.6']
const repoUrl = 'https://github.com/forcegravity1989/builder-workbench'
const labels = {
  overview: '版本总览',
  plan: '计划',
  tasks: '任务',
  acceptance: '验收',
  work: '工作区',
  taskDetail: '任务详情'
}
const blankVersion = () => ({ trees: [], sessions: [], selected: null })
const initialVersions = () => ({
  'v0.7': {
    trees: ['plan'],
    sessions: [{ id: 'p07', label: 'v0.7 · 计划讨论', role: 'plan' }],
    selected: 'p07'
  },
  'v0.8': blankVersion(),
  'v0.6': {
    trees: ['plan', 'acceptance'],
    sessions: [
      { id: 'p06', label: 'v0.6 · 计划讨论示例', role: 'plan' },
      { id: 'a06', label: 'v0.6 · 验收讨论示例', role: 'acceptance' }
    ],
    selected: 'p06'
  }
})
const branchFor = (v, session) =>
  `bw/${v}/${session?.issue ? `issue-${session.issue}` : session?.role === 'goal' ? `goal-${session.goal}` : session?.role || 'plan'}`
const Icon = ({ icon: Component, ...props }) => <Component size={15} strokeWidth={1.7} {...props} />
function Button({ children, icon, primary, className = '', ...props }) {
  return (
    <button className={`action ${primary ? 'primary ' : ''}${className}`} {...props}>
      {icon && <Icon icon={icon} />}
      {children}
    </button>
  )
}
function Nav({ children, icon, active, onClick, className = '', title }) {
  return (
    <button
      title={title}
      className={`nav-row ${active ? 'selected ' : ''}${className}`}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      {icon && <Icon icon={icon} />}
      <span>{children}</span>
    </button>
  )
}
function Modal({ title, children, close, wide }) {
  const ref = useRef(null)
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  }, [close])
  useEffect(() => {
    const old = document.activeElement
    const first = ref.current?.querySelector('button,input,select,textarea,a[href]')
    first?.focus()
    const key = (event) => {
      if (event.key === 'Escape') {
        closeRef.current()
      }
      if (event.key === 'Tab') {
        const nodes = [
          ...ref.current.querySelectorAll('button,input,select,textarea,a[href]')
        ].filter((n) => !n.disabled)
        const first = nodes[0],
          last = nodes.at(-1)
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('keydown', key)
      if (old?.isConnected) {
        old.focus()
      }
    }
  }, [])
  return (
    <div className="overlay" onClick={(event) => event.target === event.currentTarget && close()}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        className={`modal ${wide ? 'wide' : ''}`}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-button" aria-label="关闭对话框" onClick={close}>
            <Icon icon={X} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  )
}
function App() {
  const [version, setVersion] = useState('v0.7')
  const [screen, setScreen] = useState('plan')
  const [versions, setVersions] = useState(initialVersions)
  const [openVersions, setOpenVersions] = useState(['v0.7'])
  const [openGoals, setOpenGoals] = useState(['G2'])
  const [modal, setModal] = useState(null)
  const [sessionVisible, setSessionVisible] = useState(true)
  const [messages, setMessages] = useState({})
  const [drafts, setDrafts] = useState({})
  const [toast, setToast] = useState('')
  const [dark, setDark] = useState(false)
  const [fullHierarchy, setFullHierarchy] = useState(false)
  const [count, setCount] = useState(1)
  const [privateSession, setPrivateSession] = useState(false)
  const [goalFilters, setGoalFilters] = useState({})
  const [taskSearches, setTaskSearches] = useState({})
  const [detail, setDetail] = useState(null)
  const [detailOrigin, setDetailOrigin] = useState('tasks')
  const state = versions[version]
  const plan = plans[version] || emptyPlan
  const currentSession = state.sessions.find((s) => s.id === state.selected)
  const isVersionScreen = [
    'overview',
    'plan',
    'tasks',
    'taskDetail',
    'acceptance',
    'work'
  ].includes(screen)
  const isSplit = ['plan', 'acceptance'].includes(screen) && sessionVisible && currentSession
  const planStage = ['preparation', 'goals', 'review', 'breakdown', 'archive'].indexOf(
    plan.workflow?.stage
  )
  const goals = plan.goals
  const tasks = plan.tasks
  const goalFilter = goalFilters[version] || 'all'
  const notify = (text) => setToast(text)
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(''), 4500)
      return () => clearTimeout(timer)
    }
  }, [toast])
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])
  function go(v, next) {
    setVersion(v)
    setScreen(next)
    if (!openVersions.includes(v)) {
      setOpenVersions([...openVersions, v])
    }
    if (next === 'plan' || next === 'acceptance') {
      setVersions((prev) => ({
        ...prev,
        [v]: { ...prev[v], selected: prev[v].sessions.find((s) => s.role === next)?.id || null }
      }))
    }
  }
  function showTasks(goal = 'all') {
    setGoalFilters({ ...goalFilters, [version]: goal })
    go(version, 'tasks')
  }
  function openDetail(item, origin = 'tasks') {
    setDetail(item)
    setDetailOrigin(origin)
    setScreen('taskDetail')
  }
  function start(role, issue) {
    const goal = issue ? plan.tasks.find((t) => t.number === issue)?.goalId : undefined
    const id = issue ? `${version}/issue/${issue}` : `${version}/${role}/${count}`
    setCount(count + 1)
    const label = issue
      ? `#${issue} · ${issues.find((i) => i.number === issue).title.replace(/^【[^】]+】/, '')}`
      : version + (role === 'plan' ? ' · 计划讨论' : ' · 验收讨论')
    setVersions((prev) => {
      const old = prev[version],
        existing = issue && old.sessions.find((s) => s.issue === issue)
      return {
        ...prev,
        [version]: {
          trees: [
            ...new Set([
              ...old.trees,
              'plan',
              ...(issue
                ? [`goal-${goal}`, `issue-${issue}`]
                : role === 'acceptance'
                  ? ['acceptance']
                  : [])
            ])
          ],
          selected: existing?.id || id,
          sessions: existing
            ? old.sessions
            : [...old.sessions, { id, label, role: issue ? 'issue' : role, issue, goal }]
        }
      }
    })
    setScreen(issue ? 'work' : role)
    setSessionVisible(true)
    setModal(null)
    notify(issue ? '打开演示工作区；未创建真实分支或会话' : '已新建演示会话，仅在本页生效')
  }
  function openGoal(v, goal) {
    const id = `${v}/goal/${goal}`
    setVersions((prev) => ({
      ...prev,
      [v]: {
        trees: [...new Set([...prev[v].trees, 'plan', `goal-${goal}`])],
        sessions: prev[v].sessions.some((s) => s.id === id)
          ? prev[v].sessions
          : [...prev[v].sessions, { id, label: `${goal} · 目标讨论`, role: 'goal', goal }],
        selected: id
      }
    }))
    go(v, 'work')
    setSessionVisible(true)
  }
  function selectSession(v, session) {
    go(v, session.role === 'issue' || session.role === 'goal' ? 'work' : session.role)
    setVersions((prev) => ({ ...prev, [v]: { ...prev[v], selected: session.id } }))
    setSessionVisible(true)
  }
  function toggle(list, value, setter) {
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  }
  function worktreeCard(v, role, sessions, goal, issue) {
    const data = versions[v]
    const branch = branchFor(v, { role, goal, issue })
    const activate = () =>
      sessions.length
        ? selectSession(v, sessions[0])
        : role === 'goal'
          ? openGoal(v, goal)
          : go(v, role)
    return (
      <div className="native-worktree-card" data-worktree-branch={branch}>
        <button className="native-worktree-heading" onClick={activate}>
          <Icon icon={GitBranch} />
          <span>{branch}</span>
          <small>本地</small>
        </button>
        {sessions.map((s) => (
          <Nav
            key={s.id}
            className="session-row native-agent-row"
            icon={MessageSquare}
            active={
              version === v && data.selected === s.id && (screen === s.role || screen === 'work')
            }
            onClick={() => selectSession(v, s)}
          >
            <span className="agent-tool">Codex</span>
            {s.role === 'issue'
              ? `#${s.issue} · ${s.label.split(' · ').slice(1).join(' · ')}`
              : s.label}
          </Nav>
        ))}
      </div>
    )
  }
  function versionNav(v) {
    const data = versions[v],
      expanded = openVersions.includes(v)
    const materializedGoals = data.trees.filter((t) => t.startsWith('goal-')).map((t) => t.slice(5))
    return (
      <div className="version-group" key={v}>
        <button
          className="nav-row version-toggle"
          onClick={() => toggle(openVersions, v, setOpenVersions)}
          aria-expanded={expanded}
          aria-label={`${v} 展开或收起`}
        >
          <Icon icon={expanded ? ChevronDown : ChevronRight} />
          <Icon icon={PackageCheck} />
          <strong>{v}</strong>
          {v === 'v0.8' && <small>并行示例</small>}
        </button>
        {expanded && (
          <div className="version-children">
            <Nav
              icon={LayoutDashboard}
              active={version === v && screen === 'overview'}
              onClick={() => go(v, 'overview')}
            >
              总览
            </Nav>
            <Nav
              icon={CalendarRange}
              active={version === v && screen === 'plan'}
              onClick={() => go(v, 'plan')}
            >
              计划
            </Nav>
            {data.trees.includes('plan') &&
              worktreeCard(
                v,
                'plan',
                data.sessions.filter((s) => s.role === 'plan')
              )}
            <Nav
              icon={ListTodo}
              active={version === v && ['tasks', 'taskDetail'].includes(screen)}
              onClick={() => go(v, 'tasks')}
            >
              任务
            </Nav>
            {materializedGoals.map((g) => (
              <div className="worktree-children" key={g}>
                {worktreeCard(
                  v,
                  'goal',
                  data.sessions.filter((s) => s.role === 'goal' && s.goal === g),
                  g
                )}
                {data.sessions
                  .filter((s) => s.role === 'issue' && s.goal === g)
                  .map((s) => (
                    <div key={s.id} className="issue-tree">
                      {worktreeCard(v, 'issue', [s], g, s.issue)}
                    </div>
                  ))}
              </div>
            ))}
            <Nav
              icon={ClipboardCheck}
              active={version === v && screen === 'acceptance'}
              onClick={() => go(v, 'acceptance')}
            >
              验收
            </Nav>
            {data.trees.includes('acceptance') &&
              worktreeCard(
                v,
                'acceptance',
                data.sessions.filter((s) => s.role === 'acceptance')
              )}
          </div>
        )}
      </div>
    )
  }
  function sessionPanel() {
    const id = currentSession.id
    return (
      <section className="session-panel" aria-label="原生会话工作区示意">
        <div className="native-tabs">
          <span>
            <Icon icon={MessageSquare} />
            {currentSession.issue
              ? `#${currentSession.issue}`
              : currentSession.role === 'plan'
                ? '计划讨论'
                : currentSession.role === 'goal'
                  ? '目标讨论'
                  : '验收讨论'}
          </span>
          <button
            className="icon-button"
            aria-label="收起会话"
            onClick={() =>
              screen === 'work' ? showTasks(currentSession.goal || 'all') : setSessionVisible(false)
            }
          >
            <Icon icon={X} />
          </button>
        </div>
        <div className="session-content">
          <div className="session-caption">{currentSession.label}</div>
          <div className="chat-user">
            {currentSession.issue
              ? `围绕 #${currentSession.issue} 开展工作，先核对 ${currentSession.goal} 的目标与验收标准。`
              : currentSession.role === 'goal'
                ? `核对 ${currentSession.goal} 的交付目标、子任务与验收证据。`
                : currentSession.role === 'plan'
                  ? '梳理这个版本要交付的目标，以及从计划、任务到验收的旅程。'
                  : '核对本版本计划、交付件与证据，列出待确认的结果。'}
          </div>
          <div className="chat-answer">
            <div className="assistant-label">
              <span className="avatar">C</span>Codex <small>演示回复</small>
            </div>
            <p>
              {currentSession.issue
                ? `任务已关联到 ${version} / ${currentSession.goal}。工作区沿用原生会话界面。`
                : `本会话属于 ${version}。切换到其他版本后，可以从侧边栏回到这里继续。`}
            </p>
            <div className="context-card">
              <Icon icon={GitBranch} />
              <div>
                <strong>{branchFor(version, currentSession)}</strong>
                <small>候选工作树分支 · 会话随工作树保留</small>
              </div>
            </div>
            <p className="muted">此处演示原生会话区的布局与导航；没有调用模型或创建真实工作树。</p>
          </div>
          {(messages[id] || []).map((m) => (
            <div key={m.id} className="chat-user">
              {m.text}
            </div>
          ))}
        </div>
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault()
            if (!drafts[id]?.trim()) {
              return
            }
            setMessages({
              ...messages,
              [id]: [
                ...(messages[id] || []),
                { id: `${id}/message/${count}`, text: drafts[id].trim() }
              ]
            })
            setCount(count + 1)
            setDrafts({ ...drafts, [id]: '' })
            notify('演示输入已保留在当前会话，未发送给模型')
          }}
        >
          <textarea
            aria-label="演示会话输入"
            placeholder="继续讨论当前目标…"
            value={drafts[id] || ''}
            onChange={(event) => setDrafts({ ...drafts, [id]: event.target.value })}
          />
          <div>
            <span>
              Codex <ChevronDown size={12} />
            </span>
            <button className="send" aria-label="添加演示消息" type="submit">
              <ArrowRight size={15} />
            </button>
          </div>
        </form>
        <div className="branch-footer">
          <Icon icon={GitBranch} />
          {branchFor(version, currentSession)}
        </div>
      </section>
    )
  }

  function goalCard(goal) {
    const expanded = openGoals.includes(goal.goalId)
    const linked = tasks.filter((t) => t.goalId === goal.goalId)
    return (
      <article className="goal-card" key={goal.goalId}>
        <button
          className="goal-heading"
          aria-expanded={expanded}
          onClick={() => toggle(openGoals, goal.goalId, setOpenGoals)}
        >
          <Icon icon={expanded ? ChevronDown : ChevronRight} />
          <span className="goal-id">{goal.goalId}</span>
          <strong>{goal.title}</strong>
          <span className="count">{linked.length}</span>
        </button>
        {expanded && (
          <div className="goal-body">
            <div className="goal-meta">
              <span>
                负责人 <strong>{goal.owner || '未填写'}</strong>
              </span>
              <span>
                计划完成 <span className="muted">未填写</span>
              </span>
            </div>
            <label>交付件</label>
            <p className="preline">{goal.deliverable}</p>
            <label>验收标准</label>
            <p className="preline">{goal.acceptance}</p>
            <div className="tasks-label">
              关联 Issue <small>{linked.length}</small>
              <button className="text-link" onClick={() => showTasks(goal.goalId)}>
                查看目标任务 <ArrowRight size={12} />
              </button>
            </div>
            {linked.map((t) => {
              const issue = issues.find((i) => i.number === t.number)
              return (
                <div className="task-row" key={t.number}>
                  <span
                    className="issue-circle"
                    aria-label={issue ? '快照状态：打开' : '状态未加载'}
                  />
                  {issue ? (
                    <button className="task-name" onClick={() => openDetail(issue, 'plan')}>
                      <span>#{t.number}</span>
                      {issue.title}
                    </button>
                  ) : (
                    <a
                      className="task-name"
                      href={`${repoUrl}/issues/${t.number}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      #{t.number} · 查看 Issue
                      <Icon icon={ExternalLink} />
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </article>
    )
  }

  function board() {
    if (screen === 'overview') {
      return (
        <VersionOverview
          version={version}
          plan={plan}
          issues={issues}
          readAt={issueSnapshot.readAt}
          onPlan={() => go(version, 'plan')}
          onTasks={showTasks}
          onAcceptance={() => go(version, 'acceptance')}
        />
      )
    }
    if (screen === 'tasks') {
      return (
        <ScopedTasks
          key={version}
          version={version}
          plan={plan}
          issues={issues}
          goal={goalFilter}
          search={taskSearches[version] || ''}
          setSearch={(search) => setTaskSearches({ ...taskSearches, [version]: search })}
          setGoal={(goal) => setGoalFilters({ ...goalFilters, [version]: goal })}
          onDetail={openDetail}
          onAction={(item) => start('issue', item.number)}
          hasWorkspace={(number) => state.trees.includes(`issue-${number}`)}
        />
      )
    }
    if (screen === 'taskDetail' && detail) {
      return (
        <SharedIssueDetail
          item={detail}
          goal={plan.goals.find(
            (g) => g.goalId === plan.tasks.find((t) => t.number === detail.number)?.goalId
          )}
          origin={detailOrigin}
          onBack={() => go(version, detailOrigin)}
          onAction={(item) => start('issue', item.number)}
          hasWorkspace={state.trees.includes(`issue-${detail.number}`)}
        />
      )
    }
    if (screen === 'plan') {
      return (
        <div className="page-content">
          <div className="page-title">
            <div>
              <h1>版本计划</h1>
              <p>{version} · Builder Workbench</p>
            </div>
            <Button icon={MessageSquare} onClick={() => start('plan')}>
              新建计划
            </Button>
          </div>
          <div className="journey" aria-label="计划旅程">
            {['准备', '目标', '评审', '拆解', '归档'].map((s, i) => (
              <React.Fragment key={s}>
                {i > 0 && <span className="journey-line" />}
                <span className={i === planStage ? 'current' : ''}>
                  <span>{i <= planStage ? <Check size={11} /> : i + 1}</span>
                  {s}
                </span>
              </React.Fragment>
            ))}
          </div>
          <div className="progress-card">
            <div>
              <label>版本进展</label>
              <p className="muted">
                {version === 'v0.7'
                  ? '计划引用了 v0.6 验收；原型未加载该材料，不代填进展。'
                  : plan.summary?.progress || '暂无前序验收引用。'}
              </p>
            </div>
            <div>
              <label>风险与约束</label>
              <p className="muted">{plan.summary?.risks || '尚未填写'}</p>
            </div>
          </div>
          <div className="section-title">
            <h2>
              本版目标 <small>{goals.length}</small>
            </h2>
            <span className="muted">负责人 · 交付件 · 验收标准</span>
          </div>
          {goals.length ? (
            goals.map(goalCard)
          ) : (
            <div className="empty">
              <Icon icon={Target} />
              <h3>还没有版本目标</h3>
              <p>新建计划会话后，与模型一起明确本版要交付什么。</p>
            </div>
          )}
          <div className="archive-status">
            <Icon icon={GitPullRequest} />
            {plan.workflow?.archivePr ? (
              <>
                <a
                  href={`${repoUrl}/pull/${plan.workflow.archivePr.number}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  计划材料 PR #{plan.workflow.archivePr.number}
                </a>
                <span>{version === 'v0.7' ? '已合入 · 状态快照' : '状态未读取'}</span>
              </>
            ) : (
              <span>计划材料尚未归档</span>
            )}
          </div>
        </div>
      )
    }

    return (
      <div className="page-content">
        <div className="page-title">
          <div>
            <h1>版本验收</h1>
            <p>{version} · 按原计划核对交付</p>
          </div>
          <Button icon={MessageSquare} onClick={() => start('acceptance')}>
            新建验收
          </Button>
        </div>
        <div className="notice">尚未载入该版本验收材料；以下仅显示计划承诺，结果待人确认。</div>
        <div className="journey">
          {['准备', '展示与核对', '归档'].map((s, i) => (
            <React.Fragment key={s}>
              {i > 0 && <span className="journey-line" />}
              <span>
                <span>{i + 1}</span>
                {s}
              </span>
            </React.Fragment>
          ))}
        </div>
        {goals.length ? (
          goals.map((g) => (
            <article className="card" key={g.goalId}>
              <div className="accept-title">
                <span className="goal-id">{g.goalId}</span>
                <h3>{g.title}</h3>
                <span className="badge">待确认</span>
              </div>
              <p className="preline">{g.deliverable}</p>
              <div className="evidence-empty">验收证据尚未载入</div>
            </article>
          ))
        ) : (
          <div className="empty">
            <Icon icon={ClipboardCheck} />
            <h3>尚未制定计划</h3>
            <p>先明确目标与验收标准。</p>
            <Button onClick={() => go(version, 'plan')}>进入计划</Button>
          </div>
        )}
      </div>
    )
  }

  function otherScreen() {
    if (screen === 'project') {
      return <ExistingProjectOverview dark={dark} />
    }
    if (screen === 'wall') {
      return (
        <div className="page-content full-page">
          <h1>项目墙</h1>
          <p className="muted">选择项目，进入它的版本与工作。</p>
          <button className="project-card" onClick={() => setScreen('project')}>
            <span className="project-avatar">B</span>
            <div>
              <h2>Builder Workbench</h2>
              <p>forcegravity1989 / builder-workbench</p>
            </div>
            <Icon icon={ArrowRight} />
          </button>
          <p className="muted wall-note">当前项目聚焦在侧边栏上方；下方保留其他原生项目入口。</p>
        </div>
      )
    }
    if (screen === 'private') {
      return (
        <div className="private-workspace">
          <div className="native-tabs">
            personal-notes <span className="badge">私人项目示例</span>
          </div>
          <div className="empty">
            <Icon icon={MessageSquare} />
            <h1>{privateSession ? '整理个人笔记' : '开始新会话'}</h1>
            <p>同一套原生工作树与会话界面。</p>
            {privateSession ? (
              <div className="card">personal-notes / main · 演示会话</div>
            ) : (
              <Button primary icon={Plus} onClick={() => setPrivateSession(true)}>
                新建演示会话
              </Button>
            )}
          </div>
        </div>
      )
    }
    return (
      <div className="page-content full-page">
        <h1>{screen === 'automations' ? '项目自动化' : '项目知识库'}</h1>
        <p className="muted">Builder Workbench · 沿用当前项目公共能力</p>
        <div className="card">
          <p>
            {screen === 'automations'
              ? '这里只确定入口位置。每个版本的执行工作树与现有自动化如何绑定，需沿原生运行路径验证。'
              : '知识库仍由项目共用，本轮不改造其页面与编辑能力。'}
          </p>
          <Button onClick={() => setModal({ type: 'research' })}>查看复用边界</Button>
        </div>
      </div>
    )
  }
  return (
    <div className="prototype">
      <div className="review-bar">
        <strong>G2 交互原型 · 修订 2</strong>
        <span>
          {screen === 'project'
            ? '项目总览沿用既有原型预览（历史 v0.5 快照）；本轮不改造'
            : '原生组件复用示意 · 尚未挂接 Electron · 会话均为演示'}
        </span>
        <div className="review-actions">
          <button onClick={() => setModal({ type: 'research' })}>预研与方案</button>
          <button onClick={() => setDark(!dark)}>{dark ? '浅色' : '深色'}</button>
          <button onClick={() => location.reload()}>重置演示</button>
        </div>
      </div>
      <div className="shell">
        <aside className="sidebar">
          <div className="app-header">
            <span className="brand-mark">B</span>
            <strong>Workbench</strong>
            <small>⌘ K</small>
          </div>
          <Nav icon={LayoutDashboard} active={screen === 'wall'} onClick={() => setScreen('wall')}>
            项目墙
          </Nav>
          <div className="sidebar-scroll">
            <div className={`bw-section ${screen === 'private' ? 'inactive-project' : ''}`}>
              <button className="project-heading" onClick={() => setScreen('project')}>
                <span className="project-avatar">B</span>
                <span>
                  Builder Workbench<small>当前项目</small>
                </span>
                <Icon icon={ChevronDown} />
              </button>
              <Nav
                icon={LayoutDashboard}
                active={screen === 'project'}
                onClick={() => setScreen('project')}
              >
                项目总览
              </Nav>
              <Nav
                icon={CalendarClock}
                active={screen === 'automations'}
                onClick={() => setScreen('automations')}
              >
                自动化
              </Nav>
              <Nav
                icon={BookOpen}
                active={screen === 'knowledge'}
                onClick={() => setScreen('knowledge')}
              >
                知识库
              </Nav>
              <div className="section-label">版本</div>
              {versionOrder.map(versionNav)}
            </div>
          </div>
          <div className="native-projects">
            <div className="section-label">其他项目</div>
            <Nav
              icon={GitBranch}
              active={screen === 'private'}
              onClick={() => setScreen('private')}
            >
              personal-notes <small>示例</small>
            </Nav>
            {screen === 'private' && (
              <Nav
                className="session-row"
                icon={MessageSquare}
                onClick={() => setPrivateSession(true)}
              >
                main · 个人笔记
              </Nav>
            )}
          </div>
          <div className="sidebar-footer">
            <span className="user-avatar">Y</span>yuzhup<span>本地</span>
          </div>
        </aside>
        <main className="workspace">
          <div className="workspace-header">
            <div className="breadcrumb">
              {screen === 'private' ? (
                <>
                  <span>personal-notes</span>
                  <ChevronRight size={12} />
                  <span>main</span>
                </>
              ) : (
                <>
                  <button onClick={() => setScreen('project')}>Builder Workbench</button>
                  {isVersionScreen && (
                    <>
                      <ChevronRight size={12} />
                      <button onClick={() => go(version, 'overview')}>{version}</button>
                      <ChevronRight size={12} />
                      <strong>{labels[screen]}</strong>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="header-actions">
              {['plan', 'acceptance'].includes(screen) && currentSession && (
                <button
                  className="icon-button"
                  aria-label={sessionVisible ? '收起会话' : '展开会话'}
                  onClick={() => setSessionVisible(!sessionVisible)}
                >
                  <Icon icon={MessageSquare} />
                </button>
              )}
              <button
                className="icon-button"
                aria-label="原型说明"
                onClick={() => setModal({ type: 'research' })}
              >
                <Icon icon={Info} />
              </button>
            </div>
          </div>
          {screen === 'work' ? (
            <div className="native-workspace-full">{sessionPanel()}</div>
          ) : isVersionScreen ? (
            <div className={`workspace-body ${isSplit ? 'split' : ''}`}>
              {isSplit && sessionPanel()}
              <section className="business-panel">{board()}</section>
            </div>
          ) : (
            <div className="workspace-body single">{otherScreen()}</div>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {modal?.type === 'research' && (
        <Modal title="G2 · 原生复用与版本运作" close={() => setModal(null)} wide>
          <div className="research-intro">
            本轮只新增版本运作导航、业务绑定与版本总览。项目总览保持原样；工作树卡片、父子树、agent
            行、完整会话区、任务列表/详情/执行动作，以及现有计划和验收 UI，均以复用为目标。HTML
            中是交互示意，尚未挂接生产组件。
          </div>
          <h3>按版本并列，先不做专门归档</h3>
          <p>
            v0.8、v0.7、v0.6
            并列，随时展开进入当时的总览、计划、任务和验收。不设“历史会话”入口或“已归档”分区；版本目录的收起只减少视觉占用。
          </p>
          <p>
            删除沿用 Orca 原生工作树菜单与校验，本原型不模拟删除。Git
            中的计划/验收材料、工作树文件、Orca
            会话记录是不同对象，不能把删除工作树解释为删除版本，也不能承诺仅靠 Git 恢复全部 agent
            历史。旧共享树的会话归属仍需核对，不能按分支名自动归类。
          </p>
          <h3>每个版本自己的计划与验收树</h3>
          <div className="tree-diagram">
            <div>
              v0.7 / plan <small>候选：版本根兼计划</small>
            </div>
            <div>
              ├ goal-G2 <small>原生父工作树</small>
            </div>
            <div>
              │ └ issue-383 <small>原生子工作树与 agent</small>
            </div>
            <div>
              └ acceptance <small>v0.7 独立验收工作树</small>
            </div>
          </div>
          <p>
            不同版本不共用同一计划/验收树；同一版本内稳定复用，首次需要时创建。每版是否额外创建一个纯版本父树仍待决定。父子关系不决定
            Git 分支基线、未提交内容继承或合入方向。
          </p>
          <div className="cost-box">
            <label className="check-label">
              <input
                type="checkbox"
                checked={fullHierarchy}
                onChange={(e) => setFullHierarchy(e.target.checked)}
              />
              版本根与计划工作树分开
            </label>
            <div className="cost-numbers">
              <strong>
                {fullHierarchy ? 17 : 16}
                <small>棵 / v0.7 全部预建对比</small>
              </strong>
              <strong>
                {fullHierarchy ? '3.05' : '2.87'}
                <small>GiB / 文件内容体积示意</small>
              </strong>
            </div>
            <small>
              4 个目标 + 10 个 Issue + 计划/验收。按 main 2be8d77 的受控 blob 内容 183.7 MiB /
              树乘算，不含依赖、构建结果、LFS 与文件系统开销，不是磁盘实测。实际候选按需创建；Git
              对象共享，稀疏检出需先验证运行依赖。
            </small>
          </div>
          <h3>任务屏是一套 UI，范围由 BW 提供</h3>
          <table>
            <thead>
              <tr>
                <th>入口</th>
                <th>范围和行为</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>版本 → 任务</td>
                <td>
                  本版计划的全部 Issue 引用；按目标缩小范围。复用原生表格、状态、详情与开工/打开。
                </td>
              </tr>
              <tr>
                <td>计划里的 Issue</td>
                <td>
                  只保留关联信息与共用详情入口；本版暂不放独立“开工/继续”。如保留快捷动作，应调用相同原生动作；与
                  #385 的直接开工诉求待对齐。
                </td>
              </tr>
              <tr>
                <td>工作树 / agent</td>
                <td>选择后进入完整原生工作区，不把任务列表和新造的业务卡硬塞在会话旁。</td>
              </tr>
            </tbody>
          </table>
          <p>
            现有 TaskPage 依赖全局模型、来源、缓存与分页，不能只过滤当前页。原生按 repoId + Issue
            号寻找关联树，尚无版本/目标条件；跨版引用同一 Issue
            时必须明确工作树归属，不能打开任意一棵旧树。
          </p>
          <h3>版本总览自然成为版本总结</h3>
          <p>
            同一页汇总计划承诺、任务事实、验收结果、交付物/发布、遗留安排。进行中持续补齐；发布后引用当时确认的材料与发布证据，保持可回读，不重新填写另一份报告。Issue
            关闭不自动等于目标达成，缺少结论和证据时仍保留未知。发布时固定哪些材料修订，留到落地契约中明确。
          </p>
          <h3>当前源码证据</h3>
          <p>
            WorktreeCard / WorktreeCardAgents / 原生 lineage 行构建；AppWorkspaceShell →
            Terminal；CycleWorkspaceShell → PlanningBoard / AcceptancePage；TaskPageGitHubRows /
            useTaskPageWorkspaceActions / nativeTaskPort；OverviewPage。这些生产文件均未在本轮改动。
          </p>
          <p>
            已有父级选择器和稀疏创建入口可以在当前客户端试验树上体验。仓库源码已核对，尚未实际操作你的安装版。HTML
            只在页面内存模拟；刷新清空，不证明 Electron、Git 创建、provider 写回或会话恢复。
          </p>
          <p>
            计划：v0.7 来自 PR #386 / 331c04f，v0.6 来自 main / 2be8d77。Issue 标题与状态是读取于{' '}
            {issueSnapshot.readAt.slice(0, 10)} 的快照。v0.8
            与全部会话为演示。项目总览嵌入既有历史原型，仅代表复用位置，不能当作当前生产数据。
          </p>
          <p>
            <a href="https://git-scm.com/docs/git-worktree" target="_blank" rel="noreferrer">
              Git worktree
            </a>{' '}
            ·{' '}
            <a href="https://git-scm.com/docs/git-sparse-checkout" target="_blank" rel="noreferrer">
              Git sparse-checkout
            </a>
          </p>
        </Modal>
      )}
    </div>
  )
}
createRoot(document.getElementById('root')).render(<App />)
