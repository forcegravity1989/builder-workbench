import snapshot from './g2-plan-snapshot.json'
import snapshotV06 from './g2-plan-v06-snapshot.json'
import issueSnapshot from './g2-issue-snapshot.json'
import { VersionOverview } from './g2-version-overview.jsx'
import { IconAction as Button } from './g2-icon-action.jsx'
import { DesignReferences } from './g2-design-references.jsx'
import { useBindingDemo } from './g2-binding-demo.jsx'
import { TaskPreview } from './g2-task-preview.jsx'

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
  sessions: []
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
    ]
  },
  'v0.6': {
    trees: [
      { id: 'plan', role: 'plan' },
      { id: 'acceptance', role: 'acceptance' }
    ],
    sessions: [
      { id: 'p06', tree: 'plan', label: '计划讨论' },
      { id: 'a06', tree: 'acceptance', label: '验收讨论' }
    ]
  }
})
function versionTrees(version, seed = blankVersion()) {
  return seed.trees.map((tree) => ({
    ...tree,
    id: `${version}/${tree.id}`,
    version,
    name: `bw/${version}/${tree.id}`,
    branch: `bw/${version}/${tree.id}`,
    parent: tree.parent ? `${version}/${tree.parent}` : undefined,
    sessions: seed.sessions.filter((session) => session.tree === tree.id)
  }))
}
function initialTrees() {
  return [
    ...Object.entries(initialVersions()).flatMap(([version, seed]) => versionTrees(version, seed)),
    {
      id: 'remote/v0.7/plan',
      name: 'bw/v0.7/plan',
      branch: 'bw/v0.7/plan',
      owner: 'remote',
      version: 'v0.7',
      role: 'plan',
      sessions: [],
      history: [{ id: 'remote-plan-history', label: '计划讨论 · Claude' }]
    },
    {
      id: 'local/feature/notes',
      name: 'feature/notes',
      branch: 'feature/notes',
      version: null,
      role: 'goal',
      sessions: [{ id: 'notes-discussion', label: '功能讨论' }]
    }
  ]
}
const Icon = ({ icon: Component, ...props }) => <Component size={15} strokeWidth={1.7} {...props} />
function treeTitle(tree) {
  if (tree.manualName || !tree.issue) {
    return tree.name
  }
  const issue = issueSnapshot.items.find((item) => item.number === tree.issue)
  return `#${tree.issue} ${issue?.title || tree.linkedTitle || 'Issue'}`
}
// Native Lucide paths, kept local so the shared frozen vendor remains unchanged.
function NativeToolIcon({ kind, size = 16, strokeWidth = 1.7, ...props }) {
  const paths = {
    activity: [
      'M10.268 21a2 2 0 0 0 3.464 0',
      'M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326'
    ],
    options: [
      'M10 5H3',
      'M12 19H3',
      'M14 3v4',
      'M16 17v4',
      'M21 12h-9',
      'M21 19h-5',
      'M21 5h-7',
      'M8 10v4',
      'M8 12H3'
    ],
    add: [
      'M12 10v6',
      'M9 13h6',
      'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'
    ]
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[kind].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
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
        const nodes = [
          ...ref.current.querySelectorAll('button,input,textarea,summary,select,a[href]')
        ].filter((n) => !n.disabled)
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
    [screen, setScreen] = useState('project')
  const [versionOrder, setVersionOrder] = useState(['v0.7', 'v0.6'])
  const [selectedTreeId, setSelectedTreeId] = useState(null)
  const [selectedSessionId, setSelectedSessionId] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [openVersions, setOpenVersions] = useState(['v0.7']),
    [openGoals, setOpenGoals] = useState(['v0.7/G2'])
  const [closedTrees, setClosedTrees] = useState([]),
    [goalFilters, setGoalFilters] = useState({})
  const [modal, setModal] = useState(null),
    [versionName, setVersionName] = useState(''),
    [versionError, setVersionError] = useState('')
  const [dark, setDark] = useState(false),
    [toast, setToast] = useState('')
  const [remoteDisconnected, setRemoteDisconnected] = useState(false)
  const [taskVersion, setTaskVersion] = useState(null)
  const [taskEntry, setTaskEntry] = useState(0)
  const [otherProjectsOpen, setOtherProjectsOpen] = useState(false)
  const [nativeProjectOpen, setNativeProjectOpen] = useState(false)
  const [nativeOtherOpen, setNativeOtherOpen] = useState(false)
  const versionRefs = useRef({})
  const bindingDemo = useBindingDemo({
    versionOrder,
    plans,
    Modal,
    notify: setToast,
    disconnected: remoteDisconnected,
    initialTrees,
    onOpen: (tree) => activateTree(tree.version, tree),
    onBound: (v, role, goal) => {
      go(v, role === 'plan' || role === 'acceptance' ? role : 'tasks', goal)
      if (goal) {
        setOpenGoals((items) => [...new Set([...items, `${v}/${goal}`])])
      }
    }
  })
  const plan = plans[version] || emptyPlan,
    filter = goalFilters[version] || 'all'
  const currentTree = bindingDemo.trees.find((tree) => tree.id === selectedTreeId)
  const currentSession = currentTree?.sessions.find((session) => session.id === selectedSessionId)
  const boundTrees = bindingDemo.boundTrees(version)
  const nativeProjectTrees = bindingDemo.trees.filter(
    (tree) => !versionOrder.includes(tree.version)
  )
  const isVersionScreen = Object.hasOwn(labels, screen) && (screen !== 'tasks' || !!taskVersion)
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])
  useEffect(() => {
    versionRefs.current['v0.7']?.querySelector('.version-row')?.scrollIntoView({ block: 'nearest' })
  }, [])
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
    if (next === 'tasks') {
      setTaskVersion(v)
      setTaskEntry((entry) => entry + 1)
      setGoalFilters((prev) => ({ ...prev, [v]: goal || 'all' }))
    }
  }
  function enterProject() {
    const latest = versionOrder[0]
    setScreen('project')
    setSelectedTreeId(null)
    setSelectedSessionId(null)
    if (latest) {
      setVersion(latest)
      setOpenVersions((prev) => [...new Set([...prev, latest])])
      requestAnimationFrame(() =>
        versionRefs.current[latest]
          ?.querySelector('.version-row')
          ?.scrollIntoView({ block: 'nearest' })
      )
    }
  }
  function openProjectTasks() {
    setScreen('tasks')
    setTaskVersion(null)
    setGoalFilters((prev) => ({ ...prev, [version]: 'all' }))
    setTaskEntry((entry) => entry + 1)
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
    bindingDemo.setTrees((trees) => [...trees, ...versionTrees(name)])
    setVersionOrder((prev) => [name, ...prev])
    go(name, 'plan')
    setModal(null)
    setToast('已创建版本')
  }
  function startWorkflow(role) {
    const existing = bindingDemo
      .boundTrees(version)
      .find((tree) => tree.role === role && tree.owner !== 'remote')
    const registered = bindingDemo.trees.find((tree) => tree.id === `${version}/${role}`)
    if (!existing && registered) {
      activateTree(registered.version, registered)
      return
    }
    const tree = existing || versionTrees(version).find((item) => item.role === role)
    const session = {
      id: `${tree.id}/session/${tree.sessions.length + 1}`,
      label: role === 'plan' ? '计划讨论' : '验收讨论'
    }
    const updated = { ...tree, sessions: [...tree.sessions, session] }
    bindingDemo.setTrees((items) =>
      existing ? items.map((item) => (item.id === tree.id ? updated : item)) : [...items, updated]
    )
    activateTree(version, tree, session)
    setToast('演示：原有入口新建会话，归入当前工作树')
  }
  const cleanupListRef = useRef(null)
  function confirmCleanup(v) {
    const nodes = [...(cleanupListRef.current?.querySelectorAll('input[data-tree]:checked') || [])]
    const allTrees = bindingDemo.boundTrees(v)
    const selectedIds = nodes
      .map((node) => node.dataset.tree)
      .filter((id) =>
        allTrees.some((tree) => tree.id === id && !(remoteDisconnected && tree.owner === 'remote'))
      )
    const localCount = allTrees.filter(
      (tree) => selectedIds.includes(tree.id) && tree.owner !== 'remote'
    ).length
    const remoteCount = selectedIds.length - localCount
    bindingDemo.removeTrees(selectedIds)
    setModal(null)
    setToast(
      `演示：本机 ${localCount} 棵工作树经原生删除链（含预检）${
        remoteCount ? `，配对机 ${remoteCount} 棵在归属宿主删除` : ''
      }；材料与版本目录保留`
    )
  }
  function activateTree(v, tree, session) {
    if (!tree || (tree.owner === 'remote' && remoteDisconnected)) {
      return
    }
    setSelectedTreeId(tree.id)
    setSelectedSessionId(session?.id || tree.sessions[0]?.id || null)
    setHistoryOpen(false)
    if (v) {
      go(v, tree.role === 'plan' || tree.role === 'acceptance' ? tree.role : 'work')
    } else {
      setScreen('work')
    }
  }
  function createGoalTree(v, goal, name, note) {
    const existing = bindingDemo
      .boundTrees(v)
      .find((tree) => tree.role === 'goal' && tree.goal === goal)
    if (existing) {
      activateTree(v, existing)
      setModal(null)
      return
    }
    const id = `${v}/goal-${goal}`
    const registered = bindingDemo.trees.find((tree) => tree.id === id)
    if (registered) {
      activateTree(registered.version, registered)
      setModal(null)
      return
    }
    const tree = {
      id,
      version: v,
      name: name || `bw/${id}`,
      manualName: !!name,
      comment: note || '',
      branch: `bw/${id}`,
      role: 'goal',
      goal,
      sessions: [{ id: `${id}/session`, label: `${goal} · 目标协作` }]
    }
    bindingDemo.setTrees((trees) => [...trees, tree])
    setOpenGoals((prev) => [...new Set([...prev, `${v}/${goal}`])])
    activateTree(v, tree)
    setModal(null)
    setToast('演示：从原生创建器建立目标工作区；未为目标内每个 Issue 建树')
  }
  function completeIssueStart(reference, parentId, name, note, linkedTitle) {
    if (!reference) {
      return
    }
    const existing = bindingDemo
      .boundTrees(version)
      .find((tree) => tree.role === 'issue' && tree.issue === reference.number)
    if (existing) {
      activateTree(version, existing)
      return
    }
    const id = `${version}/issue-${reference.number}`
    const registered = bindingDemo.trees.find((tree) => tree.id === id)
    if (registered) {
      activateTree(registered.version, registered)
      return
    }
    const tree = {
      id,
      version,
      name: name || `bw/${id}`,
      manualName: !!name,
      comment: note || '',
      branch: `bw/${id}`,
      role: 'issue',
      linkedTitle,
      goal: reference.goalId,
      issue: reference.number,
      parent: parentId || undefined,
      sessions: [{ id: `${id}/session`, label: `#${reference.number} · 执行讨论` }]
    }
    bindingDemo.setTrees((trees) => [...trees, tree])
    setOpenGoals((prev) => [...new Set([...prev, `${version}/${reference.goalId}`])])
    activateTree(version, tree)
    setToast('演示：打开本版任务工作区；不会为了任务自动创建目标父树')
  }
  function startIssue(reference, linkedTitle) {
    if (!reference) {
      return
    }
    const existing = boundTrees.find(
      (tree) => tree.role === 'issue' && tree.issue === reference.number
    )
    if (existing) {
      activateTree(version, existing)
      return
    }
    const parent = boundTrees.find((tree) => tree.role === 'goal' && tree.goal === reference.goalId)
    setModal({
      type: 'composer',
      kind: 'issue',
      version,
      goal: reference.goalId,
      reference,
      linkedTitle,
      parentId: parent?.id || null
    })
  }
  function taskIssueTree(reference) {
    const planned =
      taskVersion &&
      plan.tasks.some(
        (item) => item.number === reference.number && item.repository === reference.repository
      )
    return (planned ? boundTrees : bindingDemo.trees).find(
      (tree) => tree.role === 'issue' && tree.issue === reference.number
    )
  }
  function nativeTree(v, tree, pool = bindingDemo.boundTrees(v)) {
    const key = tree.id,
      expanded = !closedTrees.includes(key)
    const sessions = tree.sessions,
      children = pool.filter((item) => item.parent === tree.id)
    return (
      <div className="native-worktree-card" data-branch={tree.branch} key={tree.id}>
        <div className="native-tree-row" {...bindingDemo.contextMenuProps(tree)}>
          <button
            className="tree-chevron"
            aria-label={`${treeTitle(tree)} 展开或收起`}
            aria-expanded={expanded}
            onClick={() => toggle(closedTrees, key, setClosedTrees)}
          >
            <Icon icon={expanded ? ChevronDown : ChevronRight} />
          </button>
          <button
            className="native-worktree-heading"
            title={`${treeTitle(tree)}\n分支：${tree.branch} · 右键管理版本绑定`}
            onClick={() => activateTree(tree.version, tree)}
          >
            <Icon icon={GitBranch} />
            <span>{treeTitle(tree)}</span>
            {tree.owner === 'remote' && remoteDisconnected && (
              <span
                className="disconnected-mark"
                role="img"
                aria-label="配对机已断开"
                title="配对机已断开"
              >
                <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                  <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" />
                  <path d="M4 12 12 4" stroke="currentColor" />
                </svg>
              </span>
            )}
          </button>
        </div>
        <div className="native-host-meta">
          <span>{tree.owner === 'remote' ? '配对机' : 'Local Windows'}</span>
        </div>
        {expanded && (
          <div className="native-tree-contents">
            {sessions.map((session) => (
              <Nav
                key={session.id}
                className="native-agent-row"
                icon={MessageSquare}
                active={
                  selectedTreeId === tree.id &&
                  selectedSessionId === session.id &&
                  ['work', 'plan', 'acceptance'].includes(screen)
                }
                onClick={() => activateTree(tree.version, tree, session)}
                title={session.label}
              >
                <span className="agent-tool">Codex</span>
                {session.label}
              </Nav>
            ))}
            {!sessions.length && <div className="tree-empty">暂无会话</div>}
            {children.map((child) => (
              <div className="native-child-tree" key={child.id}>
                {nativeTree(v, child, pool)}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
  function goalDirectory(v, goal) {
    const key = `${v}/${goal.goalId}`,
      expanded = openGoals.includes(key)
    const group = bindingDemo
      .boundTrees(v)
      .filter((tree) => ['goal', 'issue'].includes(tree.role) && tree.goal === goal.goalId)
    const roots = group.filter((tree) => !group.some((parent) => parent.id === tree.parent))
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
              taskVersion === v && screen === 'tasks' && filter === goal.goalId ? 'selected' : ''
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
              roots.map((tree) => nativeTree(v, tree, group))
            ) : (
              <div className="tree-empty">尚无工作树</div>
            )}
          </div>
        )}
      </div>
    )
  }
  function workflowNav(v, role) {
    const trees = bindingDemo.boundTrees(v).filter((tree) => tree.role === role)
    const tree = trees.length === 1 ? trees[0] : null
    const key = `${v}/${role}`
    const expanded = !closedTrees.includes(key)
    return (
      <div className="workflow-tree" data-workflow={key}>
        <div
          className={`workflow-row ${version === v && screen === role ? 'selected' : ''}`}
          {...bindingDemo.contextMenuProps(tree)}
        >
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
            title={tree ? `${tree.branch} · 右键管理版本绑定` : labels[role]}
            onClick={() => (tree ? activateTree(v, tree) : go(v, role))}
          >
            <Icon icon={role === 'plan' ? CalendarRange : ClipboardCheck} />
            <span>{labels[role]}</span>
            {tree?.owner === 'remote' && remoteDisconnected && (
              <span
                className="disconnected-mark"
                role="img"
                aria-label="配对机已断开"
                title="配对机已断开"
              >
                <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                  <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" />
                  <path d="M4 12 12 4" stroke="currentColor" />
                </svg>
              </span>
            )}
          </button>
        </div>
        {expanded && (
          <div className="workflow-agents">
            {trees.length ? (
              trees.map((item) => nativeTree(v, item, trees))
            ) : (
              <div className="tree-empty">尚无工作树</div>
            )}
          </div>
        )}
      </div>
    )
  }
  function versionNav(v) {
    const expanded = openVersions.includes(v),
      goals = (plans[v] || emptyPlan).goals
    return (
      <div
        className="version-group"
        key={v}
        ref={(element) => {
          versionRefs.current[v] = element
        }}
      >
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
              active={taskVersion === v && screen === 'tasks' && filter === 'all'}
              onClick={() => go(v, 'tasks', 'all')}
            >
              任务
            </Nav>
            <div className="goal-directories">
              {goals.map((g) => goalDirectory(v, g))}
              {bindingDemo
                .boundTrees(v)
                .filter(
                  (tree) =>
                    ['goal', 'issue'].includes(tree.role) &&
                    !goals.some((goal) => goal.goalId === tree.goal)
                )
                .map((tree) => nativeTree(v, tree))}
              {!goals.length && <div className="tree-empty">目标来自本版计划</div>}
            </div>
            {workflowNav(v, 'acceptance')}
          </div>
        )}
      </div>
    )
  }
  function nativeHistory() {
    if (!currentTree?.history?.length) {
      return null
    }
    const unavailable = currentTree.owner === 'remote' && remoteDisconnected
    return (
      <div className="native-history-demo">
        <button
          className="button"
          disabled={unavailable}
          aria-expanded={historyOpen}
          onClick={() => setHistoryOpen(!historyOpen)}
        >
          历史会话
        </button>
        {historyOpen &&
          currentTree.history.map((session) => (
            <div className="binding-history" key={session.id}>
              <span>{session.label}</span>
              <button
                className="button"
                disabled={
                  unavailable || currentTree.sessions.some((item) => item.id === session.id)
                }
                onClick={() => {
                  bindingDemo.setTrees((trees) =>
                    trees.map((tree) =>
                      tree.id === currentTree.id &&
                      !tree.sessions.some((item) => item.id === session.id)
                        ? { ...tree, sessions: [...tree.sessions, session] }
                        : tree
                    )
                  )
                  setSelectedSessionId(session.id)
                  setToast('演示：沿原生历史恢复会话')
                }}
              >
                {currentTree.sessions.some((item) => item.id === session.id)
                  ? '已恢复'
                  : '恢复会话'}
              </button>
            </div>
          ))}
      </div>
    )
  }
  function body() {
    if (screen === 'overview') {
      return (
        <VersionOverview
          version={version}
          status={version === 'v0.6' ? '历史' : '在制'}
          plan={plan}
          trees={boundTrees}
          issues={issueSnapshot.items}
          readAt={issueSnapshot.readAt}
          onPlan={() => go(version, 'plan')}
          onTasks={(goal) => go(version, 'tasks', goal)}
          onAcceptance={() => go(version, 'acceptance')}
        />
      )
    }
    if (screen === 'plan' || screen === 'acceptance') {
      const active =
        currentTree?.version === version && currentTree.role === screen ? currentSession : null
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
          {currentTree?.version === version && currentTree.role === screen && nativeHistory()}
          <a
            className="prototype-board-link"
            href={
              screen === 'plan'
                ? '../version-planning/planning-journey-prototype.html'
                : '../version-acceptance/acceptance-journey-prototype.html'
            }
          >
            查看本轮{labels[screen]}屏高保真 →
          </a>
        </ReuseSurface>
      )
    }
    if (screen === 'tasks') {
      return (
        <TaskPreview
          key={taskEntry}
          version={taskVersion}
          goal={taskVersion && filter !== 'all' ? filter : null}
          goals={plan.goals}
          references={plan.tasks}
          issues={issueSnapshot.items}
          Modal={Modal}
          getIssueActionLabel={(reference) => (taskIssueTree(reference) ? '打开' : '开工')}
          onChangeScope={(nextVersion, nextGoal) => {
            setTaskVersion(nextVersion)
            setGoalFilters((prev) => ({ ...prev, [version]: nextGoal || 'all' }))
          }}
          onStartIssue={(reference, linkedTitle) => {
            const planned =
              taskVersion &&
              plan.tasks.some(
                (item) =>
                  item.number === reference.number && item.repository === reference.repository
              )
            if (planned) {
              startIssue(reference, linkedTitle)
              return
            }
            const existing = taskIssueTree(reference)
            if (existing) {
              activateTree(existing.version, existing)
              return
            }
            setModal({ type: 'composer', kind: 'native', reference, linkedTitle })
          }}
          onNotice={setToast}
        />
      )
    }
    if (screen === 'work') {
      return (
        <ReuseSurface
          title="沿用 Orca 完整工作区"
          scope={`Builder Workbench${currentTree ? ` / ${treeTitle(currentTree)}` : ''}`}
          description={`原生会话、标签、分屏、工具和历史保持原交互。${currentTree?.version ? `版本归属：${currentTree.version}。` : '未绑定版本。'}${currentSession ? `当前演示会话：${currentSession.label}。` : '暂无会话。'}${currentTree?.parent ? `原生父树：${bindingDemo.trees.find((tree) => tree.id === currentTree.parent)?.name || currentTree.parent}。` : ''}`}
        >
          {nativeHistory()}
        </ReuseSurface>
      )
    }
    if (screen === 'project-workspaces') {
      return (
        <ReuseSurface
          title="沿用 Orca 项目工作区"
          scope="Builder Workbench / 原生工作树"
          description="这里保留未归版的工作树与会话，包括旧流程树和项目共用树。已归版的树从上方版本入口进入，解绑后回到这里；旧会话不按标题猜版本，共享访问沿原宿主与权限。"
        >
          <div className="native-project-tree-list">
            {nativeProjectTrees
              .filter((tree) => !nativeProjectTrees.some((parent) => parent.id === tree.parent))
              .map((tree) => nativeTree(null, tree, nativeProjectTrees))}
          </div>
        </ReuseSurface>
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
        <button className="project-card" onClick={enterProject}>
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
        <strong>#439 既有能力修正 · 版本工作区</strong>
        <span>既有能力纠偏 · 数据与操作仅在本页演示</span>
        <div className="review-actions" aria-label="原型评审工具">
          <button onClick={() => setScreen('wall')}>从项目墙进入</button>
          <button onClick={() => go('v0.7', 'tasks')}>版本任务</button>
          <button onClick={() => go('v0.7', 'tasks', 'G2')}>目标任务</button>
          <button onClick={() => setDark(!dark)}>{dark ? '浅色' : '深色'}</button>
          <button
            onClick={() => {
              setRemoteDisconnected(!remoteDisconnected)
              setOpenGoals((items) => [...new Set([...items, 'v0.7/G1'])])
              setOpenVersions((items) => [...new Set([...items, 'v0.7'])])
            }}
          >
            {remoteDisconnected ? '恢复配对机连接' : '模拟配对机断开'}
          </button>
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
                icon={ListTodo}
                active={screen === 'tasks' && !taskVersion}
                onClick={openProjectTasks}
              >
                任务
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
          <div className="native-projects scrollbar-sleek worktree-sidebar-scrollbar">
            <div className="section-label native-workspaces-heading">
              <span>Orca 项目工作区</span>
              <div className="native-workspaces-tools">
                <Button icon={ChevronRight} label="全部收起" onClick={() => {
                  setNativeProjectOpen(false)
                  setNativeOtherOpen(false)
                  setOtherProjectsOpen(false)
                  setClosedTrees((items) => [...new Set([...items, ...nativeProjectTrees.map((tree) => tree.id)])])
                }} />
                <Button icon={ChevronDown} label="全部展开" onClick={() => {
                  setNativeProjectOpen(true)
                  setNativeOtherOpen(true)
                  setOtherProjectsOpen(true)
                  const ids = new Set(nativeProjectTrees.map((tree) => tree.id))
                  setClosedTrees((items) => items.filter((id) => !ids.has(id)))
                }} />
                <Button
                  icon={(props) => <NativeToolIcon kind="activity" {...props} />}
                  label="活动"
                  onClick={() => setModal({ type: 'native-tool', title: '活动' })}
                />
                <Button
                  icon={(props) => <NativeToolIcon kind="options" {...props} />}
                  label="工作区选项"
                  onClick={() => setModal({ type: 'native-tool', title: '工作区选项' })}
                />
                <Button
                  icon={(props) => <NativeToolIcon kind="add" {...props} />}
                  label="添加项目"
                  onClick={() => setModal({ type: 'native-tool', title: '添加项目' })}
                />
                <Button
                  icon={Plus}
                  label="新建工作区"
                  onClick={() => setModal({ type: 'composer', kind: 'native' })}
                />
              </div>
            </div>
            <div className="native-project-row">
              <button
                className="tree-chevron"
                aria-label="当前原生项目展开或收起"
                aria-expanded={nativeProjectOpen}
                onClick={() => setNativeProjectOpen(!nativeProjectOpen)}
              >
                <Icon icon={nativeProjectOpen ? ChevronDown : ChevronRight} />
              </button>
              <button
                className="native-project-title"
                title="Builder Workbench · 本机与配对机"
                onClick={() => setScreen('project-workspaces')}
              >
                <Icon icon={GitBranch} />
                <span>Builder Workbench</span>
              </button>
              <div className="native-project-actions">
                <button
                  className="icon-button"
                  aria-label="Builder Workbench 项目菜单"
                  onClick={() => setModal({ type: 'native-tool', title: '项目菜单' })}
                >
                  ···
                </button>
                <Button
                  icon={Plus}
                  label="在 Builder Workbench 新建工作区"
                  onClick={() => setModal({ type: 'composer', kind: 'native' })}
                />
              </div>
            </div>
            {nativeProjectOpen && (
              <div className="native-project-tree-list">
                {nativeProjectTrees
                  .filter((tree) => !nativeProjectTrees.some((parent) => parent.id === tree.parent))
                  .map((tree) => nativeTree(tree.version, tree, nativeProjectTrees))}
              </div>
            )}
            <div className="other-projects-section">
              <button
                className="other-projects-toggle"
                aria-expanded={otherProjectsOpen}
                onClick={() => setOtherProjectsOpen(!otherProjectsOpen)}
              >
                <Icon icon={otherProjectsOpen ? ChevronDown : ChevronRight} />
                <span>其他项目</span>
                <small>1</small>
              </button>
              {otherProjectsOpen && (
                <>
                  <div className="native-project-row">
                    <button
                      className="tree-chevron"
                      aria-label="personal-notes 展开或收起"
                      aria-expanded={nativeOtherOpen}
                      onClick={() => setNativeOtherOpen(!nativeOtherOpen)}
                    >
                      <Icon icon={nativeOtherOpen ? ChevronDown : ChevronRight} />
                    </button>
                    <button className="native-project-title" onClick={() => setScreen('private')}>
                      <Icon icon={GitBranch} />
                      <span>personal-notes</span>
                    </button>
                    <div className="native-project-actions">
                      <button
                        className="icon-button"
                        aria-label="personal-notes 项目菜单"
                        onClick={() =>
                          setModal({ type: 'native-tool', title: 'personal-notes 项目菜单' })
                        }
                      >
                        ···
                      </button>
                      <Button
                        icon={Plus}
                        label="在 personal-notes 新建工作区"
                        onClick={() =>
                          setModal({ type: 'native-tool', title: 'personal-notes 新建工作区' })
                        }
                      />
                    </div>
                  </div>
                  {nativeOtherOpen && (
                    <Nav icon={MessageSquare} onClick={() => setScreen('private')}>
                      个人笔记
                    </Nav>
                  )}
                </>
              )}
            </div>
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
              {screen === 'tasks' && !taskVersion && (
                <>
                  <ChevronRight size={12} />
                  <strong>任务</strong>
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
      {modal?.type === 'native-tool' && (
        <Modal title={modal.title} close={() => setModal(null)}>
          <p className="muted">此处打开 Orca 现有的{modal.title}，本轮沿用原生交互与已有设置。</p>
        </Modal>
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
            <div className="dialog-actions">
              <Button icon={Plus} primary type="submit">
                创建版本
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {bindingDemo.overlays}
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
            {bindingDemo
              .boundTrees(modal.version)
              .some((tree) => tree.role === 'goal' && tree.goal === modal.goal) ? (
              <button
                className="goal-action-item"
                onClick={() => {
                  activateTree(
                    modal.version,
                    bindingDemo
                      .boundTrees(modal.version)
                      .find((tree) => tree.role === 'goal' && tree.goal === modal.goal)
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
            带入可修改的名称、已知版本与目标归属和合适父级建议。用户决定实际执行方式；已有树不自动改挂，版本目录不是实体父树。
          </p>
        </Modal>
      )}
      {modal?.type === 'composer' && (
        <Modal title="新建工作区" close={() => setModal(null)}>
          <div className="native-composer-fields">
            <label htmlFor="workspace-demo-name">名称</label>
            <input
              id="workspace-demo-name"
              value={
                modal.name ??
                (modal.reference
                  ? treeTitle({ issue: modal.reference.number, linkedTitle: modal.linkedTitle })
                  : modal.kind === 'goal'
                    ? `bw/${modal.version}/goal-${modal.goal}`
                    : '')
              }
              placeholder="工作区名称"
              onChange={(event) => setModal({ ...modal, name: event.target.value })}
            />
            {modal.reference && (
              <a
                className="native-composer-issue"
                href={`https://github.com/forcegravity1989/builder-workbench/issues/${modal.reference.number}`}
                target="_blank"
                rel="noreferrer"
              >
                <ListTodo size={15} />
                {treeTitle({ issue: modal.reference.number, linkedTitle: modal.linkedTitle })}
                <ArrowRight size={13} />
              </a>
            )}
            <div className="native-composer-options">
              <label>
                代码起点
                <select defaultValue="main">
                  <option value="main">main</option>
                  <option value="current">当前分支</option>
                </select>
              </label>
              <label>
                Agent
                <select defaultValue="Codex">
                  <option>Codex</option>
                  <option>Claude</option>
                </select>
              </label>
            </div>
            <details className="native-composer-advanced">
              <summary>高级</summary>
              <label htmlFor="workspace-demo-note">备注</label>
              <textarea
                id="workspace-demo-note"
                value={modal.note || ''}
                placeholder="备注（可选）"
                onChange={(event) => setModal({ ...modal, note: event.target.value })}
                rows={3}
              />
              {modal.kind === 'issue' &&
                bindingDemo
                  .boundTrees(modal.version)
                  .some((tree) => tree.role === 'goal' && tree.goal === modal.goal) && (
                  <label className="composer-demo-parent">
                    <input
                      type="checkbox"
                      checked={!!modal.parentId}
                      onChange={(e) =>
                        setModal({
                          ...modal,
                          parentId: e.target.checked
                            ? bindingDemo
                                .boundTrees(modal.version)
                                .find((tree) => tree.role === 'goal' && tree.goal === modal.goal)
                                ?.id
                            : null
                        })
                      }
                    />
                    父级：{modal.goal} 工作区
                  </label>
                )}
            </details>
          </div>
          <Button
            primary
            onClick={() => {
              if (modal.kind === 'goal') {
                createGoalTree(modal.version, modal.goal, modal.name, modal.note)
              } else if (modal.kind === 'issue') {
                completeIssueStart(
                  modal.reference,
                  modal.parentId,
                  modal.name,
                  modal.note,
                  modal.linkedTitle
                )
                setModal(null)
              } else {
                const id = `native/${Date.now()}`
                const tree = {
                  id,
                  name:
                    modal.name ||
                    (modal.reference
                      ? treeTitle({ issue: modal.reference.number, linkedTitle: modal.linkedTitle })
                      : '新工作区'),
                  manualName: !!modal.name,
                  branch: `feature/work-${Date.now()}`,
                  issue: modal.reference?.number,
                  linkedTitle: modal.linkedTitle,
                  version: null,
                  role: 'issue',
                  comment: modal.note || '',
                  sessions: []
                }
                bindingDemo.setTrees((items) => [...items, tree])
                setNativeProjectOpen(true)
                activateTree(null, tree)
                setModal(null)
              }
            }}
          >
            创建
          </Button>
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
            {bindingDemo.boundTrees(modal.version).map((tree) => (
              <label className="composer-demo-parent" key={tree.id}>
                <input
                  type="checkbox"
                  defaultChecked={tree.owner !== 'remote'}
                  disabled={remoteDisconnected && tree.owner === 'remote'}
                  data-tree={tree.id}
                />
                {tree.name || `bw/${modal.version}/${tree.id}`}
                <small>
                  {tree.owner === 'remote'
                    ? remoteDisconnected
                      ? ' · 配对机已断开'
                      : ' · 配对机 B owned（默认不勾）'
                    : ' · 本机 owned'}
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
          <h3>本轮调整范围</h3>
          <p>
            只修正项目进入定位、原生项目区呈现、Issue
            树标题、任务筛选与开工备注，不新增特性。任务控件和创建器受影响字段以可操作片段展示；既有版本总览、计划、验收和完整会话保持原有设计。
          </p>
          <p>
            当前项目已归版的树只在版本下显示，原生区保留未归版和旧树；解绑后回到原生区。仅对展示去重，不改变实际父子关系或登记。
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
            版本任务沿用完整原生任务页，进入时预选可移除的版本标签；目标入口增加可移除的目标条件。清目标看本版，清版本同时清目标看项目。Issue/PR
            与原生筛选保留；现有目标引用只有 Issue，保留目标时 PR
            为空，不推测关联。本轮局部纠偏的生产接线与验证见 STATUS。侧栏滚动样式来自当前 Orca
            main.css 的 scrollbar-sleek / worktree-sidebar-scrollbar。
          </p>
          <p>
            各版本并列，不设专门归档隐藏层。旧版本默认收起、仍可展开回看；版本级清理复用原生删除链，保留版本目录与已提交材料。版本材料和
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
