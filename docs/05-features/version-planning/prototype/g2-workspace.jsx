import snapshot from './g2-plan-snapshot.json'
import snapshotV06 from './g2-plan-v06-snapshot.json'
import issueSnapshot from './g2-issue-snapshot.json'
import { VersionOverview } from './g2-version-overview.jsx'
import { IconAction as Button } from './g2-icon-action.jsx'
import { DesignReferences } from './g2-design-references.jsx'

const {
  // React is used by the shared JSX build factory.
  // eslint-disable-next-line no-unused-vars
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
  ArrowRight,
  X,
  Info,
  PackageCheck,
  ClipboardList,
  RefreshCw
} = window.BWPrototypeDependencies
const plans = { 'v0.7': snapshot, 'v0.6': snapshotV06 }
const emptyPlan = { goals: [], tasks: [], summary: {} }
const labels = {
  overview: '版本总览',
  plan: '计划',
  tasks: '任务',
  acceptance: '验收',
  work: '工作区'
}
const blankVersion = () => ({
  trees: [
    { id: 'plan', role: 'plan' },
    { id: 'acceptance', role: 'acceptance' }
  ],
  sessions: [],
  selected: null
})
const initialVersions = () => ({
  'v0.7': {
    trees: [
      { id: 'plan', role: 'plan' },
      { id: 'acceptance', role: 'acceptance' },
      { id: 'goal-G2', role: 'goal', goal: 'G2' },
      { id: 'issue-383', role: 'issue', goal: 'G2', issue: 383, parent: 'goal-G2' },
      { id: 'goal-G1-remote', role: 'goal', goal: 'G1', owner: 'remote' }
    ],
    sessions: [
      { id: 'p07', tree: 'plan', label: '计划讨论' },
      { id: 'g07', tree: 'goal-G2', label: 'G2 · 目标协作' },
      { id: 'i383', tree: 'issue-383', label: '#383 · 侧边栏与版本运作' },
      { id: 'g01r', tree: 'goal-G1-remote', label: 'G1 · 配对机目标协作' }
    ],
    selected: 'p07'
  },
  'v0.6': {
    trees: [
      { id: 'plan', role: 'plan' },
      { id: 'acceptance', role: 'acceptance' }
    ],
    sessions: [
      { id: 'p06', tree: 'plan', label: '计划讨论' },
      { id: 'a06', tree: 'acceptance', label: '验收讨论' }
    ],
    selected: 'p06'
  }
})
const Icon = ({ icon: Component, ...props }) => <Component size={15} strokeWidth={1.7} {...props} />
function Nav({ children, icon, active, onClick, title, className = '' }) {
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
function Modal({ title, children, close }) {
  const ref = useRef(null),
    closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  }, [close])
  useEffect(() => {
    const previous = document.activeElement
    const first = ref.current?.querySelector('input') || ref.current?.querySelector('button')
    first?.focus()
    const key = (event) => {
      if (event.key === 'Escape') {
        closeRef.current()
      }
      if (event.key === 'Tab') {
        const nodes = [...ref.current.querySelectorAll('button,input,a[href]')].filter(
          (n) => !n.disabled
        )
        if (event.shiftKey && document.activeElement === nodes[0]) {
          event.preventDefault()
          nodes.at(-1)?.focus()
        } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
          event.preventDefault()
          nodes[0]?.focus()
        }
      }
    }
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('keydown', key)
      if (previous?.isConnected) {
        previous.focus()
      }
    }
  }, [])
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && close()}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header>
          <h2>{title}</h2>
          <Button icon={X} label="关闭对话框" onClick={close} />
        </header>
        <div className="modal-body scrollbar-sleek">{children}</div>
      </section>
    </div>
  )
}
function ReuseSurface({ title, scope, description, children }) {
  return (
    <div className="reuse-page">
      <div className="reuse-marker">沿用已有界面</div>
      <h1>{title}</h1>
      <p className="reuse-scope">{scope}</p>
      <p className="reuse-description">{description}</p>
      <div className="reuse-outline">
        <MessageSquare size={24} strokeWidth={1.2} />
        <span>此处挂载已有页面与交互</span>
        <small>本原型只展示入口和上下文，不另画一份界面</small>
      </div>
      {children && (
        <div className="prototype-action">
          <small>原型操作 · 查看动作后的侧栏归属</small>
          {children}
        </div>
      )}
    </div>
  )
}
function App() {
  const [version, setVersion] = useState('v0.7'),
    [screen, setScreen] = useState('plan')
  const [versions, setVersions] = useState(initialVersions),
    [versionOrder, setVersionOrder] = useState(['v0.7', 'v0.6'])
  const [openVersions, setOpenVersions] = useState(['v0.7']),
    [openGoals, setOpenGoals] = useState(['v0.7/G2'])
  const [closedTrees, setClosedTrees] = useState([]),
    [goalFilters, setGoalFilters] = useState({})
  const [modal, setModal] = useState(null),
    [versionName, setVersionName] = useState(''),
    [versionError, setVersionError] = useState('')
  const [dark, setDark] = useState(false),
    [toast, setToast] = useState('')
  const plan = plans[version] || emptyPlan,
    state = versions[version],
    filter = goalFilters[version] || 'all'
  const currentSession = state.sessions.find((s) => s.id === state.selected)
  const currentTree = state.trees.find((t) => t.id === currentSession?.tree)
  const scopedRefs = plan.tasks.filter((t) => filter === 'all' || t.goalId === filter)
  const isVersionScreen = Object.hasOwn(labels, screen)
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(''), 4000)
      return () => clearTimeout(id)
    }
  }, [toast])
  function toggle(list, value, setter) {
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  }
  function go(v, next, goal) {
    setVersion(v)
    setScreen(next)
    setOpenVersions((prev) => (prev.includes(v) ? prev : [...prev, v]))
    if (goal) {
      setGoalFilters((prev) => ({ ...prev, [v]: goal }))
    }
  }
  function openVersionDialog() {
    setVersionName('')
    setVersionError('')
    setModal({ type: 'version' })
  }
  function createVersion(event) {
    event.preventDefault()
    const name = versionName.trim()
    if (
      !name ||
      name.startsWith('.') ||
      name.endsWith('.') ||
      /[<>:"/\\|?*]/.test(name) ||
      Array.from(name).some((c) => c.charCodeAt(0) < 32) ||
      /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name) ||
      name.toLowerCase() === 'template'
    ) {
      setVersionError('请填写有效版本名，例如 v0.9；不能包含路径或特殊文件名。')
      return
    }
    const existing = versionOrder.find((v) => v.toLowerCase() === name.toLowerCase())
    if (existing) {
      setVersionError(`该版本已存在：${existing}`)
      return
    }
    setVersions((prev) => ({
      ...prev,
      [name]: blankVersion()
    }))
    setVersionOrder((prev) => [name, ...prev])
    go(name, 'plan')
    setModal(null)
    setToast('演示：计划与验收工作区已准备，进入计划；未启动 agent 或操作真实仓库')
  }
  function startWorkflow(role) {
    setVersions((prev) => {
      const old = prev[version],
        id = `${version}/${role}/${old.sessions.length + 1}`,
        trees = old.trees.some((t) => t.id === role)
          ? old.trees
          : [...old.trees, { id: role, role }]
      return {
        ...prev,
        [version]: {
          ...old,
          trees,
          sessions: [
            ...old.sessions,
            { id, tree: role, label: role === 'plan' ? '计划讨论' : '验收讨论' }
          ],
          selected: id
        }
      }
    })
    setToast(`演示：原有入口新建会话，归入当前版本的${role === 'plan' ? '计划' : '验收'}树`)
  }
  const cleanupListRef = useRef(null)
  function confirmCleanup(v) {
    const nodes = [...(cleanupListRef.current?.querySelectorAll('input[data-tree]:checked') || [])]
    const localIds = nodes
      .map((n) => n.dataset.tree)
      .filter((id) => versions[v].trees.some((t) => t.id === id))
    const remoteCount = nodes.length - localIds.length
    setVersions((prev) => {
      const old = prev[v],
        removed = new Set(localIds),
        sessions = old.sessions.filter((s) => !removed.has(s.tree))
      return {
        ...prev,
        [v]: {
          ...old,
          trees: old.trees.filter((t) => !removed.has(t.id)),
          sessions,
          selected: sessions.some((s) => s.id === old.selected) ? old.selected : null
        }
      }
    })
    setModal(null)
    setToast(
      `演示：本机 ${localIds.length} 棵工作树经原生删除链（含预检）${remoteCount ? `，配对机 ${remoteCount} 棵在归属宿主删除` : ''}；材料与版本目录保留`
    )
  }
  function activateTree(v, tree, session) {
    if (session) {
      setVersions((prev) => ({ ...prev, [v]: { ...prev[v], selected: session.id } }))
    } else {
      setVersions((prev) => ({
        ...prev,
        [v]: { ...prev[v], selected: prev[v].sessions.find((s) => s.tree === tree.id)?.id || null }
      }))
    }
    go(v, tree.role === 'plan' || tree.role === 'acceptance' ? tree.role : 'work')
  }
  function createGoalTree(v, goal) {
    const id = `goal-${goal}`,
      sessionId = `${v}/${id}`
    setVersions((prev) => {
      const old = prev[v]
      if (old.trees.some((t) => t.id === id)) {
        return prev
      }
      return {
        ...prev,
        [v]: {
          ...old,
          trees: [...old.trees, { id, role: 'goal', goal }],
          sessions: [...old.sessions, { id: sessionId, tree: id, label: `${goal} · 目标协作` }],
          selected: sessionId
        }
      }
    })
    setOpenGoals((prev) => [...new Set([...prev, `${v}/${goal}`])])
    go(v, 'work', goal)
    setModal(null)
    setToast('演示：从原生创建器建立目标工作区；未为目标内每个 Issue 建树')
  }
  function completeIssueStart(reference, parentId) {
    if (!reference) {
      return
    }
    const id = `issue-${reference.number}`,
      sessionId = `${version}/${id}`
    setVersions((prev) => {
      const old = prev[version],
        existing = old.trees.find((t) => t.id === id),
        goalParent = old.trees.find((t) => t.id === parentId)
      if (existing) {
        return {
          ...prev,
          [version]: { ...old, selected: old.sessions.find((s) => s.tree === id)?.id || null }
        }
      }
      return {
        ...prev,
        [version]: {
          ...old,
          trees: [
            ...old.trees,
            {
              id,
              role: 'issue',
              goal: reference.goalId,
              issue: reference.number,
              parent: goalParent?.id
            }
          ],
          sessions: [
            ...old.sessions,
            { id: sessionId, tree: id, label: `#${reference.number} · 执行讨论` }
          ],
          selected: sessionId
        }
      }
    })
    setOpenGoals((prev) => [...new Set([...prev, `${version}/${reference.goalId}`])])
    go(version, 'work', reference.goalId)
    setToast('演示：打开本版任务工作区；不会为了任务自动创建目标父树')
  }
  function startIssue(reference) {
    if (!reference) {
      return
    }
    const existing = state.trees.find((t) => t.issue === reference.number)
    if (existing) {
      activateTree(version, existing)
      return
    }
    const parent = state.trees.find((t) => t.role === 'goal' && t.goal === reference.goalId)
    setModal({
      type: 'composer',
      kind: 'issue',
      version,
      goal: reference.goalId,
      reference,
      parentId: parent?.id || null
    })
  }
  function nativeTree(v, tree) {
    const data = versions[v],
      key = `${v}/${tree.id}`,
      expanded = !closedTrees.includes(key)
    const sessions = data.sessions.filter((s) => s.tree === tree.id),
      children = data.trees.filter((t) => t.parent === tree.id)
    return (
      <div className="native-worktree-card" data-branch={`bw/${v}/${tree.id}`} key={tree.id}>
        <div className="native-tree-row">
          <button
            className="tree-chevron"
            aria-label={`bw/${v}/${tree.id} 展开或收起`}
            aria-expanded={expanded}
            onClick={() => toggle(closedTrees, key, setClosedTrees)}
          >
            <Icon icon={expanded ? ChevronDown : ChevronRight} />
          </button>
          <button
            className="native-worktree-heading"
            title={`bw/${v}/${tree.id}`}
            onClick={() => activateTree(v, tree)}
          >
            <Icon icon={GitBranch} />
            <span>{`bw/${v}/${tree.id}`}</span>
          </button>
        </div>
        {expanded && (
          <div className="native-tree-contents">
            {sessions.map((session) => (
              <Nav
                key={session.id}
                className="native-agent-row"
                icon={MessageSquare}
                active={
                  version === v &&
                  data.selected === session.id &&
                  ['work', 'plan', 'acceptance'].includes(screen)
                }
                onClick={() => activateTree(v, tree, session)}
                title={session.label}
              >
                <span className="agent-tool">Codex</span>
                {session.label}
              </Nav>
            ))}
            {!sessions.length && <div className="tree-empty">暂无会话</div>}
            {children.map((child) => (
              <div className="native-child-tree" key={child.id}>
                {nativeTree(v, child)}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
  function goalDirectory(v, goal) {
    const data = versions[v],
      key = `${v}/${goal.goalId}`,
      expanded = openGoals.includes(key)
    const roots = data.trees.filter((t) => t.goal === goal.goalId && !t.parent)
    return (
      <div className="goal-directory" key={goal.goalId}>
        <div className="goal-directory-row">
          <button
            className="tree-chevron"
            aria-label={`${v} ${goal.goalId} 目标目录展开或收起`}
            aria-expanded={expanded}
            onClick={() => toggle(openGoals, key, setOpenGoals)}
          >
            <Icon icon={expanded ? ChevronDown : ChevronRight} />
          </button>
          <button
            className={`goal-directory-link ${
              version === v && screen === 'tasks' && filter === goal.goalId ? 'selected' : ''
            }`}
            title={`${goal.title} · 在同一任务屏筛选 ${goal.goalId}`}
            onClick={() => go(v, 'tasks', goal.goalId)}
          >
            <Icon icon={Target} />
            <strong>{goal.goalId}</strong>
            <span>{goal.title}</span>
          </button>
          <button
            className="icon-button goal-menu"
            title={`${v} ${goal.goalId} 目标目录操作`}
            aria-label={`${v} ${goal.goalId} 目标目录操作`}
            onClick={() => setModal({ type: 'goal', version: v, goal: goal.goalId })}
          >
            ···
          </button>
        </div>
        {expanded && (
          <div className="goal-directory-body">
            {roots.length ? (
              roots.map((tree) => nativeTree(v, tree))
            ) : (
              <div className="tree-empty">尚无工作树</div>
            )}
          </div>
        )}
      </div>
    )
  }
  function workflowNav(v, role) {
    const data = versions[v],
      tree = data.trees.find((t) => t.role === role),
      key = `${v}/${role}`
    const expanded = !closedTrees.includes(key)
    const sessions = data.sessions.filter((s) => s.tree === role)
    return (
      <div className="workflow-tree" data-workflow={`${v}/${role}`}>
        <div className={`workflow-row ${version === v && screen === role ? 'selected' : ''}`}>
          <button
            className="tree-chevron"
            aria-label={`${v} ${labels[role]}会话展开或收起`}
            aria-expanded={expanded}
            onClick={() => toggle(closedTrees, key, setClosedTrees)}
          >
            <Icon icon={expanded ? ChevronDown : ChevronRight} />
          </button>
          <button
            className="workflow-link"
            title={`bw/${v}/${role} · 本版固定工作区`}
            onClick={() => (tree ? activateTree(v, tree) : go(v, role))}
          >
            <Icon icon={role === 'plan' ? CalendarRange : ClipboardCheck} />
            <span>{labels[role]}</span>
          </button>
          <button
            className="icon-button goal-menu"
            title={`${v} ${labels[role]}工作区菜单`}
            aria-label={`${v} ${labels[role]}工作区菜单`}
            onClick={() => setModal({ type: 'workflow', version: v, role })}
          >
            ···
          </button>
        </div>
        {expanded && (
          <div className="workflow-agents">
            {sessions.map((session) => (
              <Nav
                key={session.id}
                className="native-agent-row"
                icon={MessageSquare}
                active={version === v && screen === role && data.selected === session.id}
                onClick={() => activateTree(v, tree, session)}
              >
                <span className="agent-tool">Codex</span>
                {session.label}
              </Nav>
            ))}
            {!sessions.length && <div className="tree-empty">尚无会话</div>}
          </div>
        )}
      </div>
    )
  }
  function versionNav(v) {
    const expanded = openVersions.includes(v),
      goals = (plans[v] || emptyPlan).goals
    return (
      <div className="version-group" key={v}>
        <div className="version-row">
          <button
            className="nav-row version-toggle"
            aria-label={`${v} 展开或收起`}
            aria-expanded={expanded}
            onClick={() => toggle(openVersions, v, setOpenVersions)}
          >
            <Icon icon={expanded ? ChevronDown : ChevronRight} />
            <Icon icon={PackageCheck} />
            <strong>{v}</strong>
          </button>
          <Button
            icon={X}
            label={`清理 ${v} 工作树`}
            onClick={() => setModal({ type: 'cleanup', version: v })}
          />
        </div>
        {expanded && (
          <div className="version-children">
            <Nav
              icon={LayoutDashboard}
              active={version === v && screen === 'overview'}
              onClick={() => go(v, 'overview')}
            >
              总览
            </Nav>
            {workflowNav(v, 'plan')}
            <Nav
              icon={ListTodo}
              active={version === v && screen === 'tasks' && filter === 'all'}
              onClick={() => go(v, 'tasks', 'all')}
            >
              任务
            </Nav>
            <div className="goal-directories">
              {goals.map((g) => goalDirectory(v, g))}
              {!goals.length && <div className="tree-empty">目标来自本版计划</div>}
            </div>
            {workflowNav(v, 'acceptance')}
          </div>
        )}
      </div>
    )
  }
  function body() {
    if (screen === 'overview') {
      return (
        <VersionOverview
          version={version}
          plan={plan}
          issues={issueSnapshot.items}
          readAt={issueSnapshot.readAt}
          onPlan={() => go(version, 'plan')}
          onTasks={(goal) => go(version, 'tasks', goal)}
          onAcceptance={() => go(version, 'acceptance')}
        />
      )
    }
    if (screen === 'plan' || screen === 'acceptance') {
      const active = state.sessions.find((s) => s.id === state.selected && s.tree === screen)
      return (
        <ReuseSurface
          title={`沿用现有${labels[screen]}屏（含会话区）`}
          scope={`Builder Workbench / ${version}`}
          description={`侧栏这一行就是本版${labels[screen]}工作树入口，打开原有整屏：Orca 会话区与右侧${labels[screen]}板一起沿用。版本由侧栏带入，屏内不再选版；新会话仍从原板的“新建${labels[screen]}”发起。`}
        >
          <Button icon={MessageSquare} onClick={() => startWorkflow(screen)}>
            新建{labels[screen]}
          </Button>
          <span className="muted">{active ? `当前会话：${active.label}` : '尚无会话'}</span>
        </ReuseSurface>
      )
    }
    if (screen === 'tasks') {
      return (
        <ReuseSurface
          title="沿用 Orca 任务屏"
          scope={`Builder Workbench / ${version} / ${filter === 'all' ? '全部目标' : filter}`}
          description={`这是同一个 Orca 任务屏。点“任务”查看本版全部任务，点 G1/G2 只改变目标筛选，不新增目标专属屏。当前范围共有 ${scopedRefs.length} 个 Issue 引用；列表、详情、开工和打开工作区沿用原有交互。`}
        >
          {filter !== 'all' && (
            <>
              <Button icon={ListTodo} onClick={() => go(version, 'tasks', 'all')}>
                查看本版全部目标
              </Button>
              <Button
                icon={GitBranch}
                onClick={() => setModal({ type: 'goal', version, goal: filter })}
              >
                目标操作
              </Button>
            </>
          )}
          <p className="candidate-note">
            目标开工在侧栏 G1/G2 的“···”菜单；此处仅加目标范围与同一操作入口，任务列表和 Issue
            开工仍用 Orca。一个目标工作区可处理多个相关
            Issue；原创建器由用户选择执行方式，不表示目标内全部任务已开工。
          </p>
          {scopedRefs[0] && (
            <Button icon={ArrowRight} onClick={() => startIssue(scopedRefs[0])}>
              演示原生 Issue #{scopedRefs[0].number}{' '}
              {state.trees.some((t) => t.issue === scopedRefs[0].number) ? '打开工作区' : '开工'}
            </Button>
          )}
        </ReuseSurface>
      )
    }
    if (screen === 'work') {
      return (
        <ReuseSurface
          title="沿用 Orca 完整工作区"
          scope={`Builder Workbench / ${version}${currentTree ? ` / bw/${version}/${currentTree.id}` : ''}`}
          description={`原生会话、标签、分屏、工具和历史保持原交互。${currentSession ? `当前演示会话：${currentSession.label}。${currentTree?.parent ? `原生父树：bw/${version}/${currentTree.parent}。` : ''}` : '请选择侧栏的分支或会话。'}`}
        />
      )
    }
    if (screen === 'project-workspaces') {
      return (
        <ReuseSurface
          title="沿用 Orca 项目工作区"
          scope="Builder Workbench / 原生工作树"
          description="保留该项目的原生工作树与会话入口，包括尚未归版的 bw/week-plan、bw/week-acceptance 和项目共用树。旧会话不整树迁移、不按标题猜版本；共享访问沿原宿主与权限。"
        />
      )
    }
    if (screen === 'project') {
      return (
        <ReuseSurface
          title="沿用现有项目总览屏"
          scope="Builder Workbench"
          description="本轮仅调整侧栏入口。总览内容、指标和后续里程碑由总览特性维护，此处不嵌入或复刻另一份高保真。"
        />
      )
    }
    if (screen === 'automations' || screen === 'knowledge') {
      return (
        <ReuseSurface
          title={screen === 'automations' ? '沿用现有自动化屏' : '沿用现有知识库屏'}
          scope="Builder Workbench"
          description="保持当前项目能力和既有交互，此处只确定入口位置。"
        />
      )
    }
    if (screen === 'private') {
      return (
        <ReuseSurface
          title="沿用 Orca 项目工作区"
          scope="personal-notes · 私人项目示例"
          description="下方原生项目区保留当前项目和私人项目的 Orca 工作区入口；上方只聚焦项目墙选定项目的版本交付。"
        />
      )
    }
    return (
      <div className="page-content">
        <h1>项目墙</h1>
        <p className="muted">选择项目，进入它的版本与工作。</p>
        <button className="project-card" onClick={() => setScreen('project')}>
          <span className="project-avatar">B</span>
          <div>
            <h2>Builder Workbench</h2>
            <p>forcegravity1989 / builder-workbench</p>
          </div>
          <ArrowRight size={16} />
        </button>
      </div>
    )
  }
  return (
    <div className="prototype">
      <div className="review-bar">
        <strong>G2 交互原型 · 修订 8</strong>
        <span>设计定稿 · 图标操作 · 原生复用（含版本级清理） · 业界参考见右侧书本</span>
        <div className="review-actions" aria-label="原型评审工具">
          <Button
            icon={BookOpen}
            label="设计依据：业界 UI 与操作参考"
            onClick={() => setModal({ type: 'references' })}
          />
          <Button
            icon={ClipboardList}
            label="旅程与数据说明"
            href="version-workspace-journey.html"
          />
          <Button
            icon={Info}
            label="范围、目录与演示设置"
            onClick={() => setModal({ type: 'scope' })}
          />
        </div>
      </div>
      <div className="shell">
        <aside className="sidebar scrollbar-sleek-parent">
          <div className="app-header">
            <span className="brand-mark">B</span>
            <strong>Workbench</strong>
            <small>⌘ K</small>
          </div>
          <Nav icon={LayoutDashboard} active={screen === 'wall'} onClick={() => setScreen('wall')}>
            项目墙
          </Nav>
          <div className="sidebar-scroll scrollbar-sleek worktree-sidebar-scrollbar">
            <div className="bw-section">
              <div className="project-heading">
                <span className="project-avatar">B</span>
                <span>
                  Builder Workbench<small>当前项目</small>
                </span>
              </div>
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
              <div className="sidebar-divider" role="separator" />
              <div className="section-label">
                <span>版本</span>
                <Button icon={Plus} label="新建版本" onClick={openVersionDialog} />
              </div>
              {versionOrder.map(versionNav)}
            </div>
          </div>
          <div className="native-projects">
            <div className="section-label">Orca 项目工作区</div>
            <Nav
              icon={GitBranch}
              active={screen === 'project-workspaces'}
              onClick={() => setScreen('project-workspaces')}
            >
              Builder Workbench
            </Nav>
            <Nav
              icon={GitBranch}
              active={screen === 'private'}
              onClick={() => setScreen('private')}
            >
              personal-notes <small>示例</small>
            </Nav>
          </div>
          <div className="sidebar-footer">
            <span className="user-avatar">Y</span>yuzhup<span>本地</span>
          </div>
        </aside>
        <main className="workspace">
          <div className="workspace-header">
            <div className="breadcrumb">
              <button onClick={() => setScreen(screen === 'private' ? 'private' : 'project')}>
                {screen === 'private' ? 'personal-notes' : 'Builder Workbench'}
              </button>
              {isVersionScreen && (
                <>
                  <ChevronRight size={12} />
                  <button onClick={() => go(version, 'overview')}>{version}</button>
                  <ChevronRight size={12} />
                  <strong>{labels[screen]}</strong>
                  {screen === 'tasks' && filter !== 'all' && (
                    <>
                      <ChevronRight size={12} />
                      <span>{filter}</span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="workspace-body scrollbar-sleek">{body()}</div>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {modal?.type === 'version' && (
        <Modal title="新建版本" close={() => setModal(null)}>
          <p className="muted">Builder Workbench</p>
          <form onSubmit={createVersion}>
            <label htmlFor="version-name">版本名</label>
            <input
              id="version-name"
              autoComplete="off"
              placeholder="例如 v0.9"
              value={versionName}
              onChange={(e) => {
                setVersionName(e.target.value)
                setVersionError('')
              }}
            />
            {versionError && (
              <p className="form-error" role="alert">
                {versionError}
              </p>
            )}
            <p className="form-help">
              创建后准备本版计划、验收两棵固定工作树，并进入现有计划屏。不预建目标和任务树，不启动
              agent；验收材料在明确依据后准备。
            </p>
            <div className="dialog-actions">
              <Button icon={Plus} primary type="submit">
                创建并进入计划
              </Button>
            </div>
            <small className="demo-note">
              原型仅模拟目录变化，不创建真实版本材料或 Git 工作树。
            </small>
          </form>
        </Modal>
      )}
      {modal?.type === 'goal' && (
        <Modal title={`${modal.version} / ${modal.goal} · 目标目录`} close={() => setModal(null)}>
          <p>
            目标来自版本计划。可在一个目标工作区协作处理若干简单
            Issue；需独立开发时，再从原生任务屏对某个 Issue 开工。
          </p>
          <div className="goal-action-list">
            <button
              className="goal-action-item"
              onClick={() => {
                go(modal.version, 'tasks', modal.goal)
                setModal(null)
              }}
            >
              <ListTodo size={16} /> 查看目标任务
            </button>
            {versions[modal.version].trees.some((t) => t.id === `goal-${modal.goal}`) ? (
              <button
                className="goal-action-item"
                onClick={() => {
                  activateTree(
                    modal.version,
                    versions[modal.version].trees.find((t) => t.id === `goal-${modal.goal}`)
                  )
                  setModal(null)
                }}
              >
                <ArrowRight size={16} /> 打开目标工作区
              </button>
            ) : (
              <button
                className="goal-action-item"
                onClick={() => setModal({ ...modal, type: 'composer', kind: 'goal' })}
              >
                <GitBranch size={16} /> 目标开工
              </button>
            )}
          </div>
          <p className="muted">
            实际创建沿用 Orca 原生创建器和父级选择。需要独立做目标协作时才创建；目标和 Issue
            都复用原生创建器，BW
            带入可修改的名称、上下文和合适父级建议。用户决定实际执行方式；已有树不自动改挂，版本目录不是实体父树。
          </p>
        </Modal>
      )}
      {modal?.type === 'composer' && (
        <Modal title="沿用 Orca 原生开工弹窗" close={() => setModal(null)}>
          <div className="reuse-marker">既有创建器挂载位置 · 不新增 BW 开工流程</div>
          <h3>
            {modal.version} / {modal.goal}
            {modal.reference ? ` / #${modal.reference.number}` : ' · 目标开工'}
          </h3>
          <div className="candidate-note">
            <strong>BW 带入的上下文</strong>
            <p>
              项目与宿主、版本 {modal.version}、目标 {modal.goal}
              {modal.reference ? `、Issue #${modal.reference.number}` : '的交付约定与关联任务引用'}
              。
            </p>
            <p>
              名称建议：{modal.version}-
              {modal.reference ? `issue-${modal.reference.number}` : modal.goal}
              。实际名称、代码起点、模型及执行选项由原生弹窗选择。
            </p>
          </div>
          <div className="reuse-outline">
            <GitBranch size={22} />
            <span>现有名称、分支、Agent 与高级选项</span>
            <small>沿用 Orca 的原生控件与已有偏好；父级只影响嵌套，不改代码起点</small>
          </div>
          {modal.kind === 'issue' &&
            versions[modal.version].trees.some((t) => t.id === `goal-${modal.goal}`) && (
              <label className="composer-demo-parent">
                <input
                  type="checkbox"
                  checked={!!modal.parentId}
                  onChange={(e) =>
                    setModal({ ...modal, parentId: e.target.checked ? `goal-${modal.goal}` : null })
                  }
                />
                演示原生父级选择结果：挂到已有 {modal.goal} 工作区下（可取消）
              </label>
            )}
          <p className="muted">
            原型只演示原创建器提交后的归属，不复刻全部选项。目标工作区可在会话中处理多个相关
            Issue；已有工作区可从其原生 agent 入口继续，不另造“统一复用策略”设置。
          </p>
          <Button
            primary
            onClick={() => {
              if (modal.kind === 'goal') {
                createGoalTree(modal.version, modal.goal)
              } else {
                completeIssueStart(modal.reference, modal.parentId)
                setModal(null)
              }
            }}
          >
            演示原生提交后的结果
          </Button>
        </Modal>
      )}
      {modal?.type === 'workflow' && (
        <Modal
          title={`${modal.version} / ${labels[modal.role]}工作区`}
          close={() => setModal(null)}
        >
          <p>
            bw/{modal.version}/{modal.role}
          </p>
          <p>这一行同时是现有业务屏入口与本版固定工作树。下方 agent 仍归 Orca 管理。</p>
          <Button
            onClick={() => {
              go(modal.version, modal.role)
              setModal(null)
            }}
          >
            打开{labels[modal.role]}屏
          </Button>
          <p className="muted">实际产品沿用原生工作树菜单；原型不模拟删除等真实磁盘操作。</p>
        </Modal>
      )}
      {modal?.type === 'cleanup' && (
        <Modal title={`清理 ${modal.version} 工作树`} close={() => setModal(null)}>
          <p className="muted">
            与右击单树删除、Orca 工作区清理同一条删除链：未提交修改、子树与归档 hook
            预检不豁免；删除的是磁盘检出与原生登记（含 BW 绑定），Git
            材料与版本目录保留，版本仍在侧栏收起回看。
          </p>
          <div className="goal-action-list" ref={cleanupListRef}>
            {versions[modal.version].trees.map((tree) => (
              <label className="composer-demo-parent" key={tree.id}>
                <input
                  type="checkbox"
                  defaultChecked={tree.owner !== 'remote'}
                  data-tree={tree.id}
                />
                bw/{modal.version}/{tree.id}
                <small>
                  {tree.owner === 'remote' ? ' · 配对机 B owned（默认不勾）' : ' · 本机 owned'}
                </small>
              </label>
            ))}
          </div>
          <p className="muted">
            本版自动化仍启用时在此如实提示，是否停用由人在原生编辑器决定；agent 会话记录归各
            provider，删树后如实显示不可用。
          </p>
          <Button primary onClick={() => confirmCleanup(modal.version)}>
            确认删除勾选的工作树
          </Button>
        </Modal>
      )}
      {modal?.type === 'references' && (
        <Modal title="设计依据 · 业界 UI 与操作参考" close={() => setModal(null)}>
          <DesignReferences />
        </Modal>
      )}
      {modal?.type === 'scope' && (
        <Modal title="范围与演示设置" close={() => setModal(null)}>
          <div className="demo-settings">
            <label>
              <input
                type="checkbox"
                checked={dark}
                onChange={(event) => setDark(event.target.checked)}
              />{' '}
              深色外观
            </label>
            <Button icon={RefreshCw} label="重置演示" onClick={() => location.reload()} />
          </div>
          <h3>新画什么</h3>
          <p>
            项目与版本导航、新建版本、版本级清理、目标目录，以及新增版本总览。既有项目总览、计划、任务、验收、自动化、知识库和会话区只标明沿用位置，不再做平行高保真。
          </p>
          <h3>目标目录与工作树分开</h3>
          <p>
            目标目录来自计划，G1/G2
            始终可见。目录不占一份仓库，未开工时可以是空的。需要目标级独立工作时，再用原生创建器建立目标父树；Issue
            树与 agent 仍由 Orca 管理。
          </p>
          <div className="tree-explanation">
            <div>任务</div>
            <div>
              └ G2 · 目标目录 <small>BW 业务分组</small>
            </div>
            <div>
              　 ├ issue-328 → agent <small>可直接属于目标目录</small>
            </div>
            <div>
              　 └ goal-G2 <small>按需创建的原生父树</small>
            </div>
            <div>
              　 　 └ issue-383 → agent <small>真实父子关系</small>
            </div>
          </div>
          <p>
            两种缩进含义分别是“业务归属”和“原生父级”。不能把目录分组等同 Git
            父子关系，也不因创建目标父树自动重挂已有任务。
          </p>
          <h3>新建版本旅程</h3>
          <p>
            版本旁 ＋ → 输入名称 →
            创建并进入计划。准备该版计划、验收两棵树和空白计划材料，不记录目标达成、不启动会话；目标从之后的计划中产生。重名留在输入处提示，不新建重复目录。
          </p>
          <h3>复用边界</h3>
          <p>
            任务列表按项目、版本和目标限定完整引用范围；会话按原生工作区绑定。页面样式与交互沿用原组件，这些生产接线尚未实现。侧栏滚动样式来自当前
            Orca main.css 的 scrollbar-sleek / worktree-sidebar-scrollbar。
          </p>
          <p>
            各版本并列，不设专门归档分区。版本归档是人的显式动作：归档记录写入版本材料，本版计划/验收流程树进入
            Orca
            原生归档（isArchived），从原生列表隐藏、可在原生工作区清理中回看与恢复；已归档版本留在原位置、带标识、默认收起，可展开回看。删除仍沿用原生规则；版本材料和
            agent 记录不能视为同一恢复对象。
          </p>
          <p className="muted">
            v0.7/v0.6 计划为仓库快照，其中 v0.7 含配对机 owned
            实例演示跨宿主汇总；工作树、会话与清理全部是演示，没有
            Electron、文件写回或持久化恢复证据。生产接线与真壳证据见 STATUS。
          </p>
        </Modal>
      )}
    </div>
  )
}
createRoot(document.getElementById('root')).render(<App />)
