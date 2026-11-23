import snapshot from './g2-plan-snapshot.json'
import snapshotV06 from './g2-plan-v06-snapshot.json'
import issueSnapshot from './g2-issue-snapshot.json'
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
// v0.8 仅用于 #475 评审：演示版本块与原生「已固定」栏目的汇入关系。
const v08Plan = { goals: [{ goalId: 'G1', title: '双列侧栏评审' }], tasks: [], summary: {} }
const plans = { 'v0.7': snapshot, 'v0.6': snapshotV06, 'v0.8': v08Plan }
const emptyPlan = { goals: [], tasks: [], summary: {} }
plans['v1.0'] = { goals: [{ goalId: 'G1', title: 'API 接口交付' }], tasks: [], summary: {} }
const demoProjects = [
  { id: 'bw', name: 'Builder Workbench', initials: 'B', onWall: true },
  { id: 'api', name: 'Demo API', initials: 'D', onWall: true },
  { id: 'personal', name: 'personal-notes', initials: 'P', onWall: false }
]
const treeProject = (tree) => tree.projectId || 'bw'
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
  },
  'v0.8': {
    trees: [
      { id: 'plan', role: 'plan' },
      { id: 'acceptance', role: 'acceptance' },
      { id: 'goal-G1', role: 'goal', goal: 'G1' },
      {
        id: 'issue-501',
        role: 'issue',
        goal: 'G1',
        issue: 501,
        parent: 'goal-G1',
        linkedTitle: '评审：#475 双列侧栏'
      },
      {
        id: 'issue-520',
        role: 'issue',
        goal: 'G1',
        issue: 520,
        parent: 'goal-G1',
        linkedTitle: '已固定栏目回显演示'
      }
    ],
    sessions: [
      { id: 'p08', tree: 'plan', label: '计划讨论' },
      { id: 'a08', tree: 'acceptance', label: '验收讨论' },
      { id: 'g08', tree: 'goal-G1', label: 'G1 · 目标协作' },
      { id: 'i501', tree: 'issue-501', label: '#501 · 双列侧栏评审' },
      { id: 'i520', tree: 'issue-520', label: '#520 · 已固定回显' }
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
  const pinnedIds = new Set([
    'v0.7/issue-383',
    'remote/v0.7/plan',
    'local/feature/notes',
    'v0.8/issue-520'
  ])
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
    },
    {
      id: 'api/feature/auth',
      projectId: 'api',
      name: 'feature/auth',
      branch: 'feature/auth',
      version: 'v1.0',
      role: 'goal',
      goal: 'G1',
      isPinned: true,
      sessions: [{ id: 'api-auth', label: '登录接口讨论' }]
    },
    {
      id: 'api/main',
      projectId: 'api',
      name: 'main',
      branch: 'main',
      version: null,
      sessions: [{ id: 'api-review', label: '接口评审' }]
    },
    {
      id: 'personal/main',
      projectId: 'personal',
      name: 'main',
      branch: 'main',
      version: null,
      isPinned: true,
      sessions: [{ id: 'personal-writing', label: '个人笔记整理' }]
    },
    {
      id: 'personal/reading',
      projectId: 'personal',
      name: 'reading',
      branch: 'reading',
      version: null,
      sessions: [{ id: 'personal-reading', label: '读书笔记' }]
    }
  ].map((tree, index) => ({
    ...tree,
    lastActivity: index,
    isPinned: tree.isPinned || pinnedIds.has(tree.id)
  }))
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
    tasks: ['M3 5h.01', 'M3 12h.01', 'M3 19h.01', 'M8 5h13', 'M8 12h13', 'M8 19h13'],
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
    ],
    pin: [
      'M12 17v5',
      'M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z'
    ],
    wall: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
    crosshair: [
      'M22 12h-4',
      'M6 12H2',
      'M12 6V2',
      'M12 22v-4',
      'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
      'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'
    ],
    kanban: ['M6 5v11', 'M12 5v6', 'M18 5v14'],
    settings: [
      'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z',
      'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'
    ],
    help: [
      'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
      'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3',
      'M12 17h.01'
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
function NativeTaskIcon(props) {
  return <NativeToolIcon kind="tasks" {...props} />
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
  // The current sidebar and historical business journey share the feature's prototype source.
  const is475 = !!window.__BW_PROTO_LAYOUT_475
  const [version, setVersion] = useState('v0.7'),
    // 475 页默认落在对象上下文（版本工作区），其余模块入口是整页、没有第二列。
    [screen, setScreen] = useState(is475 ? 'overview' : 'project')
  const [versionOrder, setVersionOrder] = useState(
    is475 ? ['v0.8', 'v0.7', 'v0.6', 'v0.5', 'v0.4'] : ['v0.8', 'v0.7', 'v0.6']
  )
  const [otherProjectVersions, setOtherProjectVersions] = useState({ api: ['v1.0'], personal: [] })
  const [activeProjectId, setActiveProjectId] = useState('bw')
  const activeProject = demoProjects.find((project) => project.id === activeProjectId)
  const versionsForTree = (tree) =>
    treeProject(tree) === 'bw' ? versionOrder : otherProjectVersions[treeProject(tree)] || []
  const activeVersions = versionsForTree({ projectId: activeProjectId })
  const [showMoreVersions, setShowMoreVersions] = useState(false)
  const [showPinnedInGroups, setShowPinnedInGroups] = useState(false)
  const [closedNativeProjects, setClosedNativeProjects] = useState(['bw'])
  const [selectedTreeId, setSelectedTreeId] = useState(null)
  const [selectedSessionId, setSelectedSessionId] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [openVersions, setOpenVersions] = useState(is475 ? [] : ['v0.7', 'v0.8']),
    [openGoals, setOpenGoals] = useState(['v0.7/G2', 'v0.8/G1'])
  const [closedTrees, setClosedTrees] = useState([]),
    [goalFilters, setGoalFilters] = useState({})
  // 已固定栏目沿用原生分组的收起记忆（生产用 collapsedGroups 的 pinned 分组）。
  const [pinnedCollapsed475, setPinnedCollapsed475] = useState(false)
  const [modal, setModal] = useState(null),
    [versionName, setVersionName] = useState(''),
    [versionError, setVersionError] = useState('')
  const [dark, setDark] = useState(false),
    [toast, setToast] = useState('')
  const [remoteDisconnected, setRemoteDisconnected] = useState(false)
  const [taskVersion, setTaskVersion] = useState(null)
  const [taskEntry, setTaskEntry] = useState(0)
  // 沿用 Orca 默认单位置展示；评审工具可切换原生的重复显示选项。
  const [panelWidth, setPanelWidth] = useState(280)
  const [panelCollapsed475, setPanelCollapsed475] = useState(false)
  const sidebarScrollRef = useRef(null)
  const versionRefs = useRef({})
  const bindingDemo = useBindingDemo({
    versionOrder,
    plans,
    Modal,
    notify: setToast,
    disconnected: remoteDisconnected,
    initialTrees,
    versionsForTree,
    onOpen: (tree) => activateTree(tree.version, tree),
    onBound: (v, role, goal, tree) => {
      setActiveProjectId(treeProject(tree))
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
  const pinnedIds475 = new Set(
    bindingDemo.trees.filter((tree) => tree.isPinned).map((tree) => tree.id)
  )
  let addedPinnedDescendant = true
  while (addedPinnedDescendant) {
    addedPinnedDescendant = false
    for (const tree of bindingDemo.trees) {
      if (pinnedIds475.has(tree.parent) && !pinnedIds475.has(tree.id)) {
        pinnedIds475.add(tree.id)
        addedPinnedDescendant = true
      }
    }
  }
  const sortDemoTrees = (trees) =>
    [...trees].sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0))
  const naturalTrees = (trees) =>
    sortDemoTrees(
      trees.filter((tree) => !is475 || showPinnedInGroups || !pinnedIds475.has(tree.id))
    )
  const nativeProjectTrees = bindingDemo.trees.filter(
    (tree) => treeProject(tree) !== activeProjectId || !activeVersions.includes(tree.version)
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
    if (is475 && activeVersions.indexOf(v) >= 3) {
      setShowMoreVersions(true)
      requestAnimationFrame(() => versionRefs.current[v]?.scrollIntoView({ block: 'nearest' }))
    }
    if (next === 'tasks') {
      setTaskVersion(v)
      setTaskEntry((entry) => entry + 1)
      setGoalFilters((prev) => ({ ...prev, [v]: goal || 'all' }))
    }
  }
  function enterProject(projectId = 'bw') {
    setActiveProjectId(projectId)
    if (projectId !== activeProjectId) {
      setShowMoreVersions(false)
    }
    const latest = versionsForTree({ projectId })[0]
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
    const existing = [...versionOrder, ...Object.values(otherProjectVersions).flat()].find(
      (v) => v.toLowerCase() === name.toLowerCase()
    )
    if (existing) {
      setVersionError(`该版本已存在：${existing}`)
      return
    }
    bindingDemo.setTrees((trees) => [
      ...trees,
      ...versionTrees(name).map((tree) => ({ ...tree, projectId: activeProjectId }))
    ])
    if (activeProjectId === 'bw') {
      setVersionOrder((prev) => [name, ...prev])
    } else {
      setOtherProjectVersions((prev) => ({
        ...prev,
        [activeProjectId]: [name, ...(prev[activeProjectId] || [])]
      }))
    }
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
    const tree = existing || {
      ...versionTrees(version).find((item) => item.role === role),
      projectId: activeProjectId
    }
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
    setActiveProjectId(treeProject(tree))
    setSelectedSessionId(session?.id || tree.sessions[0]?.id || null)
    setHistoryOpen(false)
    if (v) {
      setVersion(v)
      const next = tree.role === 'plan' || tree.role === 'acceptance' ? tree.role : 'work'
      setScreen(next)
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
      projectId: activeProjectId,
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
      projectId: activeProjectId,
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
  function nativeTree(v, tree, pool = bindingDemo.boundTrees(v), pinnedSection = false) {
    if (is475 && !pinnedSection && !showPinnedInGroups && pinnedIds475.has(tree.id)) {
      return null
    }
    const key = tree.id,
      expanded = !closedTrees.includes(key)
    const children = pool.filter((item) => item.parent === tree.id)
    const sessions = tree.sessions
    return (
      <div
        className="native-worktree-card"
        data-branch={tree.branch}
        data-tree-id={tree.id}
        key={tree.id}
      >
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
            className={`native-worktree-heading${selectedTreeId === tree.id ? ' selected' : ''}`}
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
          {pinnedSection && (
            <span>{demoProjects.find((project) => project.id === treeProject(tree)).name}</span>
          )}
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
                {nativeTree(v, child, pool, pinnedSection)}
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
    const all = bindingDemo
      .boundTrees(v)
      .filter((tree) => ['goal', 'issue'].includes(tree.role) && tree.goal === goal.goalId)
    const visible = naturalTrees(all)
    const roots = visible.filter((tree) => !visible.some((parent) => parent.id === tree.parent))
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
              roots.map((tree) => nativeTree(v, tree, all))
            ) : (
              <div className="tree-empty">{all.length ? '工作树已固定在顶部' : '尚无工作树'}</div>
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
            {!is475 && <Icon icon={expanded ? ChevronDown : ChevronRight} />}
            <Icon icon={PackageCheck} />
            <strong>{v}</strong>
            {is475 && (
              <span className="group-chevron-475">
                <Icon icon={expanded ? ChevronDown : ChevronRight} size={14} />
              </span>
            )}
          </button>
          {is475 && (
            <Button
              icon={(props) => <NativeToolIcon kind="add" {...props} />}
              label={`初始化 ${v} 工作区`}
              onClick={() => setModal({ type: 'native-tool', title: '初始化工作区' })}
            />
          )}
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
        <ReuseSurface
          title="沿用版本总览"
          scope={`${activeProject.name} / ${version}`}
          description="此处直接沿用版本总览特性的现有界面。本轮只调整侧栏布局，版本总览的内容、交互与样式保持原样。"
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
          scope={`${activeProject.name}${currentTree ? ` / ${treeTitle(currentTree)}` : ''}`}
          description={`原生会话、标签、分屏、工具和历史保持原交互。${currentTree?.version ? `版本归属：${currentTree.version}。` : '未绑定版本。'}${currentSession ? `当前演示会话：${currentSession.label}。` : '暂无会话。'}${currentTree?.parent ? `原生父树：${bindingDemo.trees.find((tree) => tree.id === currentTree.parent)?.name || currentTree.parent}。` : ''}`}
        >
          {nativeHistory()}
        </ReuseSurface>
      )
    }
    if (screen === 'project-workspaces') {
      return (
        <ReuseSurface
          title="沿用原生项目工作区"
          scope={`${activeProject.name} / 原生工作树`}
          description="这里保留未归版的工作树与会话，包括旧流程树和项目共用树。已归版的树从上方版本入口进入，解绑后回到这里；旧会话不按标题猜版本，共享访问沿原宿主与权限。"
        >
          <div className="native-project-tree-list">
            {naturalTrees(nativeProjectTrees)
              .filter((tree) => treeProject(tree) === activeProjectId)
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
          scope={activeProject.name}
          description="本轮仅调整侧栏入口。总览内容、指标和后续里程碑由总览特性维护，此处不嵌入或复刻另一份高保真。"
        />
      )
    }
    if (screen === 'automations' || screen === 'knowledge') {
      return (
        <ReuseSurface
          title={screen === 'automations' ? '沿用现有自动化屏' : '沿用现有知识库屏'}
          scope={activeProject.name}
          description="保持当前项目能力和既有交互，此处只确定入口位置。"
        />
      )
    }
    if (screen === 'private') {
      return (
        <ReuseSurface
          title="沿用原生项目工作区"
          scope="personal-notes · 私人项目示例"
          description="下方原生项目区保留当前项目和私人项目的 Orca 工作区入口；上方只聚焦项目墙选定项目的版本交付。"
        />
      )
    }
    return (
      <div className="page-content">
        <h1>项目墙</h1>
        <p className="muted">选择项目，进入它的版本与工作。</p>
        {demoProjects
          .filter((project) => project.onWall)
          .map((project) => (
            <button
              key={project.id}
              className="project-card"
              onClick={() => enterProject(project.id)}
            >
              <span className="project-avatar">{project.initials}</span>
              <div>
                <h2>{project.name}</h2>
                <p>
                  {project.id === 'bw'
                    ? 'forcegravity1989 / builder-workbench'
                    : '评审示例 / demo-api'}
                </p>
              </div>
              <ArrowRight size={16} />
            </button>
          ))}
      </div>
    )
  }
  // #475 双列侧栏：把侧栏各段抽成变量，原布局与双列布局共用同一份内容。
  const projectHeading475 = (
    <div className="project-heading">
      <span className="project-avatar">{activeProject.initials}</span>
      <span title={is475 ? activeProject.name : undefined}>
        {activeProject.name}
        <small>当前项目</small>
      </span>
    </div>
  )
  const nativeWorkspaceTools = (
    <div className="native-workspaces-tools" role="group" aria-label="原生工作区工具">
      <Button
        icon={(props) => <NativeToolIcon kind="activity" {...props} />}
        label="查看活动"
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
  )
  const moduleNavs475 = (
    <>
      <Nav
        icon={LayoutDashboard}
        active={screen === 'project'}
        onClick={() => setScreen('project')}
      >
        项目总览
      </Nav>
      <Nav icon={ListTodo} active={screen === 'tasks' && !taskVersion} onClick={openProjectTasks}>
        任务
      </Nav>
      <Nav
        icon={CalendarClock}
        active={screen === 'automations'}
        onClick={() => setScreen('automations')}
      >
        自动化
      </Nav>
      <Nav icon={BookOpen} active={screen === 'knowledge'} onClick={() => setScreen('knowledge')}>
        知识库
      </Nav>
    </>
  )
  const versionsBlock475 = (
    <>
      <div className="versions-heading-475 sidebar-section-heading-475">
        <Icon icon={PackageCheck} size={12} />
        <span>版本</span>
        <Button icon={Plus} label="新建版本" onClick={openVersionDialog} />
      </div>
      {(is475 ? activeVersions.slice(0, 3) : activeVersions).map(versionNav)}
      {is475 && activeVersions.length > 3 && (
        <button
          className="more-versions-475"
          aria-expanded={showMoreVersions}
          aria-controls="more-versions-475"
          onClick={() => setShowMoreVersions(!showMoreVersions)}
        >
          {showMoreVersions ? '收起更多版本' : `显示另外 ${activeVersions.length - 3} 个版本`}
        </button>
      )}
      {is475 && activeVersions.length > 3 && (
        <div id="more-versions-475" hidden={!showMoreVersions}>
          {showMoreVersions && activeVersions.slice(3).map(versionNav)}
        </div>
      )}
      {!activeVersions.length && <div className="tree-empty">暂无版本</div>}
    </>
  )
  // 原生固定栏跨项目展示；只调整栏目位置，不另设项目过滤。
  const pinnedRows475 = sortDemoTrees(bindingDemo.trees.filter((tree) => pinnedIds475.has(tree.id)))
  // 生产里没有固定树时整个栏目不渲染；行内也没有取消固定按钮，固定/取消固定走原生右键菜单。
  const pinnedSection475 =
    pinnedRows475.length === 0 ? null : (
      <div className="pinned-section-475" data-pinned-475>
        <button
          type="button"
          className="pinned-heading-475 sidebar-section-heading-475"
          aria-expanded={!pinnedCollapsed475}
          onClick={() => setPinnedCollapsed475(!pinnedCollapsed475)}
        >
          <NativeToolIcon kind="pin" size={12} />
          <span>已固定</span>
          <small>{pinnedRows475.length}</small>
          <Icon icon={pinnedCollapsed475 ? ChevronRight : ChevronDown} size={14} />
        </button>
        {!pinnedCollapsed475 &&
          pinnedRows475
            .filter((tree) => !pinnedIds475.has(tree.parent))
            .map((tree) => nativeTree(tree.version, tree, pinnedRows475, true))}
      </div>
    )
  // 只有对象上下文（版本工作区）带第二列；模块入口是整页，第二列收起、内容区占满。
  const objectContext475 =
    isVersionScreen || screen === 'project-workspaces' || screen === 'private'
  const showPanel475 = is475 && objectContext475 && !panelCollapsed475
  function railButton475(label, icon, active, onClick, title = label) {
    return (
      <button
        className={`rail-button${active ? ' selected' : ''}`}
        title={title}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        onClick={onClick}
      >
        <Icon icon={icon} size={18} />
      </button>
    )
  }
  function enterObjectContext475() {
    setPanelCollapsed475(false)
    if (!objectContext475) {
      setScreen(currentTree ? 'work' : 'project-workspaces')
    }
  }
  function resizePanel475(event) {
    const start = event.clientX
    const width = panelWidth
    event.currentTarget.setPointerCapture(event.pointerId)
    const handle = event.currentTarget
    const move = (next) => setPanelWidth(Math.max(220, Math.min(500, width + next.clientX - start)))
    const stop = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', stop)
      handle.removeEventListener('pointercancel', stop)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', stop)
    handle.addEventListener('pointercancel', stop)
  }
  const rail475 = (
    <aside className="rail-475" aria-label="全局导航">
      <button
        className="rail-brand"
        title="项目墙"
        aria-label="项目墙"
        onClick={() => setScreen('wall')}
      >
        <NativeToolIcon kind="wall" size={16} />
      </button>
      <div className="rail-group">
        {railButton475('版本工作区', PackageCheck, objectContext475, enterObjectContext475)}
        {railButton475('项目总览', LayoutDashboard, screen === 'project', () =>
          setScreen('project')
        )}
        {railButton475(
          '任务',
          NativeTaskIcon,
          screen === 'tasks' && !taskVersion,
          openProjectTasks,
          '全部任务（含未入计划）'
        )}
        {railButton475('自动化', CalendarClock, screen === 'automations', () =>
          setScreen('automations')
        )}
        {railButton475('知识库', BookOpen, screen === 'knowledge', () => setScreen('knowledge'))}
      </div>
      <div className="rail-spacer" />
      {/* 生产 Rail 底部只有设置/帮助两枚 24px 图标按钮，没有头像。 */}
      <div className="rail-foot-group">
        <button
          className="rail-foot"
          title="设置"
          aria-label="设置"
          onClick={() => setModal({ type: 'native-tool', title: '设置' })}
        >
          <NativeToolIcon kind="settings" size={14} />
        </button>
        <button
          className="rail-foot"
          title="帮助"
          aria-label="帮助"
          onClick={() => setModal({ type: 'native-tool', title: '帮助' })}
        >
          <NativeToolIcon kind="help" size={14} />
        </button>
      </div>
    </aside>
  )
  // 生产底栏两枚原生图标按钮：Crosshair「显示活动工作区」+ Kanban「工作区板」，24px、右对齐。
  const panelFooter475 = (
    <div className="panel-footer-475">
      <button
        className="icon-action"
        title="显示活动工作区"
        aria-label="显示活动工作区"
        onClick={() => {
          const rows = sidebarScrollRef.current?.querySelectorAll('[data-tree-id]') || []
          const target = [...rows].find((node) => node.dataset.treeId === selectedTreeId)
          target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          if (!target) {
            setToast('先打开一棵工作区；折叠或未呈现的树定位行为待真壳验证。')
          }
        }}
      >
        <NativeToolIcon kind="crosshair" size={14} />
      </button>
      <button
        className="icon-action"
        title="工作区板"
        aria-label="工作区板"
        onClick={() => setModal({ type: 'native-tool', title: '工作区板' })}
      >
        <NativeToolIcon kind="kanban" size={14} />
      </button>
    </div>
  )
  return (
    <div className="prototype">
      <div className="review-bar">
        <strong>{is475 ? '版本会话管理 · 双列侧栏' : '#439 既有能力修正 · 版本工作区'}</strong>
        <span>
          {is475 ? '分区布局与更多版本 · 交互原型' : '既有能力纠偏 · 数据与操作仅在本页演示'}
        </span>
        <div className="review-actions" aria-label="原型评审工具">
          {is475 && (
            <button onClick={() => setModal({ type: 'review-523' })}>操作旅程与已知差异</button>
          )}
          {is475 && objectContext475 && (
            <button
              aria-controls="workspace-panel-475"
              aria-expanded={showPanel475}
              onClick={() => setPanelCollapsed475(!panelCollapsed475)}
            >
              {showPanel475 ? '收起工作区栏' : '展开工作区栏'}
            </button>
          )}
          <button onClick={() => setScreen('wall')}>从项目墙进入</button>
          <button onClick={() => go('v0.7', 'tasks')}>版本任务</button>
          <button onClick={() => go('v0.7', 'tasks', 'G2')}>目标任务</button>
          {is475 && activeVersions.length > 3 && (
            <button onClick={() => go(activeVersions[3], 'overview')}>从外部打开旧版总览</button>
          )}
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
        {is475 && rail475}
        <aside
          className={`sidebar scrollbar-sleek-parent${is475 ? ' panel-475' : ''}${is475 && !showPanel475 ? ' hidden-475' : ''}`}
          id={is475 ? 'workspace-panel-475' : undefined}
          style={is475 ? { width: panelWidth, minWidth: panelWidth } : undefined}
        >
          {!is475 && (
            <>
              <div className="app-header">
                <span className="brand-mark">B</span>
                <strong>Workbench</strong>
                <small>⌘ K</small>
              </div>
              <Nav
                icon={LayoutDashboard}
                active={screen === 'wall'}
                onClick={() => setScreen('wall')}
              >
                项目墙
              </Nav>
            </>
          )}
          {is475 && (
            <div className="panel-heading-475">
              {projectHeading475}
              {nativeWorkspaceTools}
            </div>
          )}
          <div
            ref={sidebarScrollRef}
            className="sidebar-scroll scrollbar-sleek worktree-sidebar-scrollbar"
          >
            <div className="bw-section">
              {!is475 && projectHeading475}
              {is475 && pinnedSection475}
              {!is475 && moduleNavs475}
              {versionsBlock475}
            </div>
            <div className={`native-projects${is475 ? ' merged-scroll-475' : ''}`}>
              <div className="section-label native-workspaces-heading sidebar-section-heading-475">
                <Icon icon={GitBranch} size={12} />
                <span>全部项目工作区</span>
                {!is475 && nativeWorkspaceTools}
              </div>
              {[...demoProjects]
                .sort((a, b) => Number(b.id === activeProjectId) - Number(a.id === activeProjectId))
                .map((project) => {
                  const expanded = !closedNativeProjects.includes(project.id)
                  const projectTrees = naturalTrees(
                    nativeProjectTrees.filter((tree) => treeProject(tree) === project.id)
                  )
                  return (
                    <React.Fragment key={project.id}>
                      <div className="native-project-row" data-project-id={project.id}>
                        {!is475 && (
                          <button
                            className="tree-chevron"
                            aria-label={`${project.name} 原生项目展开或收起`}
                            aria-expanded={expanded}
                            onClick={() =>
                              toggle(closedNativeProjects, project.id, setClosedNativeProjects)
                            }
                          >
                            <Icon icon={expanded ? ChevronDown : ChevronRight} />
                          </button>
                        )}
                        <button
                          className="native-project-title"
                          title={`${project.name} · ${project.onWall ? '已上项目墙' : '个人项目，未上墙'}`}
                          aria-expanded={expanded}
                          onClick={() =>
                            toggle(closedNativeProjects, project.id, setClosedNativeProjects)
                          }
                        >
                          <Icon icon={GitBranch} />
                          <span>{project.name}</span>
                          {is475 && (
                            <span className="group-chevron-475">
                              <Icon icon={expanded ? ChevronDown : ChevronRight} size={14} />
                            </span>
                          )}
                        </button>
                        <div className="native-project-actions">
                          <button
                            className="icon-button"
                            aria-label={`${project.name} 项目菜单`}
                            onClick={() => setModal({ type: 'native-tool', title: '项目菜单' })}
                          >
                            ···
                          </button>
                          <Button
                            icon={Plus}
                            label={`在 ${project.name} 新建工作区`}
                            onClick={() => {
                              setActiveProjectId(project.id)
                              setModal({ type: 'composer', kind: 'native' })
                            }}
                          />
                        </div>
                      </div>
                      {expanded && (
                        <div className="native-project-tree-list">
                          {projectTrees
                            .filter(
                              (tree) => !projectTrees.some((parent) => parent.id === tree.parent)
                            )
                            .map((tree) => nativeTree(tree.version, tree, projectTrees))}
                          {!projectTrees.length && (
                            <div className="tree-empty">工作树显示在已固定或当前版本中</div>
                          )}
                        </div>
                      )}
                    </React.Fragment>
                  )
                })}
            </div>
          </div>
          {is475 && panelFooter475}
          {is475 && (
            <div
              role="separator"
              aria-label="调整对象侧栏宽度"
              aria-orientation="vertical"
              aria-valuemin={220}
              aria-valuemax={500}
              aria-valuenow={panelWidth}
              tabIndex={0}
              className="panel-resize-475"
              onPointerDown={resizePanel475}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                  event.preventDefault()
                  setPanelWidth((width) =>
                    Math.max(220, Math.min(500, width + (event.key === 'ArrowRight' ? 10 : -10)))
                  )
                }
              }}
            />
          )}
          {!is475 && (
            <div className="sidebar-footer">
              <span className="user-avatar">Y</span>yuzhup<span>本地</span>
            </div>
          )}
        </aside>
        <main className="workspace">
          <div className="workspace-header">
            <div className="breadcrumb">
              <button onClick={() => setScreen(screen === 'private' ? 'private' : 'project')}>
                {activeProject.name}
              </button>
              {isVersionScreen &&
                activeVersions.includes(version) &&
                (screen !== 'work' || currentTree?.version) && (
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
      {modal?.type === 'review-523' && (
        <Modal title="侧栏评审旅程" close={() => setModal(null)}>
          <p className="muted">
            基于 PR #523 / fa08630bf0
            修订，已同步实现、规格与原型，真机待人决定。本页数据仅为内存演示，刷新复原。
          </p>
          <ol className="review-journey-523">
            <li>从项目墙进入项目总览，依次点任务、自动化、知识库，观察第二列收起与主区空间。</li>
            <li>点 Rail「版本工作区」返回现有工作区内容，不自动进入计划／验收，也不创建工作树。</li>
            <li>
              展开版本与目标目录，右击一棵树「固定」。默认只在顶部显示；取消固定后回到所属目录。下方开关可对比原生的重复显示选项。
            </li>
            <li>固定目标父树，观察子树随行显示；更改或解除绑定后，固定态与会话仍保留。</li>
            <li>
              点击已固定中的 personal-notes / main 或 Demo API /
              feature/auth，确认当前项目随工作树切换，其他项目仍可达。未上墙的 personal-notes
              只在原生项目与已固定中出现。
            </li>
            <li>
              拖宽侧栏并滚动到底；原生的活动、工作区选项、添加项目、新建工作区始终留在顶部，树列表共用单一滚动区。
            </li>
          </ol>
          <label>
            <input
              type="checkbox"
              checked={showPinnedInGroups}
              onChange={(event) => setShowPinnedInGroups(event.target.checked)}
            />{' '}
            评审切换：固定工作树同时显示在原分组（Orca 默认关闭）
          </label>
          <p className="muted">
            排序沿用
            Orca：项目默认手动，工作树默认最近活动；此页静态数据不模拟真实聊天时间、智能排序与拖拽排序，原生菜单
            UI 不在这里重做。
          </p>
          <p className="muted">
            边界：未模拟生产虚拟列表的跳动、Ctrl/Cmd+1–9、筛选漏项和真实宿主通信。设置、帮助等未改原生面仅标复用，不用占位页证明已验证。
          </p>
        </Modal>
      )}
      {modal?.type === 'native-tool' && (
        <Modal title={modal.title} close={() => setModal(null)}>
          <p className="muted">此处打开 Orca 现有的{modal.title}，本轮沿用原生交互与已有设置。</p>
        </Modal>
      )}
      {modal?.type === 'version' && (
        <Modal title="新建版本" close={() => setModal(null)}>
          <p className="muted">{activeProject.name}</p>
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
                  projectId: activeProjectId,
                  lastActivity: Date.now(),
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
                setClosedNativeProjects((items) => items.filter((id) => id !== activeProjectId))
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
            {is475
              ? '调整全局导航与三段侧栏布局，工具栏、任务入口、固定、筛选和排序复用原生能力。版本总览、计划、验收和完整会话沿用既有界面。'
              : '本入口保留版本业务旅程参考；当前侧栏以双列原型为准。任务控件和创建器受影响字段以可操作片段展示，其他整屏沿用。'}
          </p>
          <p>
            当前项目已归版的树由版本目录承载；固定后默认只在顶部显示，开启原生重复显示设置后也保留原目录实例。全部项目工作区保留未归版、旧树及其他项目入口；解绑后回到原生区。显示筛选和去重不改变实际父子关系或绑定。
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
