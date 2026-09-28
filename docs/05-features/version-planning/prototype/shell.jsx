import { React } from 'react'
import {
  BookOpen,
  CalendarClock,
  CalendarRange,
  CircleHelp,
  ClipboardCheck,
  GitBranch,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  Presentation
} from 'lucide-react'

function PrototypeSidebar({ go, setModal, setSelectedIssue, view }) {
  return (
    <aside className="app-sidebar sidebar">
      <div className="brand">
        <span>B</span>
        <strong>Builders’ Workbench</strong>
      </div>
      <nav aria-label="项目内导航">
        {[
          [LayoutDashboard, '总览', 'overview'],
          [CalendarRange, '计划', 'monday'],
          [ListTodo, '任务', 'tasks'],
          [ClipboardCheck, '验收', 'friday'],
          [CalendarClock, '自动化', 'automations'],
          [BookOpen, '知识库', 'knowledge']
        ].map(([Icon, label, id]) => (
          <button
            className="sidebar-item"
            key={id}
            aria-current={view === id ? 'page' : undefined}
            onClick={() => {
              if (['automations', 'knowledge'].includes(id)) {
                setModal({
                  type: 'route',
                  title: label
                })
                return
              }
              if (id === 'tasks') {
                setSelectedIssue(null)
              }
              go(id)
            }}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-spacer" />
      <button
        className="sidebar-item source-action"
        onClick={() =>
          setModal({
            type: 'source',
            title: '原型与来源'
          })
        }
      >
        <CircleHelp />
        <span>交互原型 · 来源</span>
      </button>
    </aside>
  )
}
function PrototypeSession({ branch, composer, draft, setDraft, setNotice, view }) {
  const label = view === 'friday' ? '验收' : '计划'
  return (
    <section className="session-pane" aria-label="Orca 原生会话工作区">
      <header className="session-head">
        <GitBranch />
        <strong>{branch}</strong>
        <button
          className="btn btn-secondary"
          onClick={() => {
            setDraft('')
            setNotice(
              `原型说明：通过已登记自动化手动开始本次${label}，在原生工作区显示新会话；不改变定时开关。`
            )
          }}
        >
          新建{label}
        </button>
      </header>
      <div className="native-workspace-placeholder">
        <MessageSquare />
        <h2>复用 Orca 会话工作区</h2>
        <p>原生新建会话、Agent 选择、标签和分屏保持原样。</p>
        <p>资源管理器、智能体历史等工具侧栏沿用 Orca，可收起。</p>
        <p>本页仅固定项目与分支；已有会话在两处是同一组。</p>
        <small>此区域只标识复用边界，不另设计 BW 会话 UI。</small>
      </div>
      {draft && (
        <details className="prototype-request" open ref={composer}>
          <summary>业务按钮交给原生会话的内容（原型示意）</summary>
          <pre>{draft}</pre>
        </details>
      )}
    </section>
  )
}
function PrototypeHeader({
  review,
  setExpanded,
  setNotice,
  setTaskFilter,
  setVersion,
  version,
  view,
  weekly
}) {
  return (
    <header className="page-header">
      <h1>
        {
          {
            monday: '版本计划',
            friday: '版本验收',
            overview: '总览',
            tasks: '任务',
            metricsetup: 'Claude Code'
          }[view]
        }
      </h1>
      {view === 'monday' ? (
        <span className="tag tag-outline">v0.5</span>
      ) : view === 'friday' ? (
        <select
          className="input version-select"
          aria-label="验收版本"
          value={version}
          onChange={(e) => {
            setVersion(e.target.value)
            setNotice('')
            setTaskFilter('')
            setExpanded(false)
          }}
        >
          <option>v0.5</option>
          <option>v0.4</option>
        </select>
      ) : (
        <span className="page-state">builder-workbench</span>
      )}
      {weekly && <span className="page-state">草稿</span>}
      <span className="header-spacer" />
      {weekly && (
        <button className="btn btn-ghost" onClick={review}>
          {view === 'monday' ? <Presentation /> : <ClipboardCheck />}
          {view === 'monday' ? '评审纪要' : '验收报告'}
        </button>
      )}
    </header>
  )
}
export { PrototypeSidebar, PrototypeSession, PrototypeHeader }
