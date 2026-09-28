import { React } from 'react'
import {
  ArrowUp,
  BookOpen,
  CalendarClock,
  CalendarRange,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  GitBranch,
  History,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  Plus,
  Presentation
} from 'lucide-react'
import { Field } from './shared.jsx'

function PrototypeSidebar({ branch, go, setModal, setSelectedIssue, view }) {
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
      <div className="sidebar-section">项目</div>
      <div className="repo-node">
        <ChevronDown />
        <span>builder-workbench</span>
      </div>
      <button
        className="branch-node"
        disabled={view === 'metricsetup'}
        onClick={() =>
          setModal({
            type: 'sessions',
            title: `${branch} · 会话`
          })
        }
      >
        <GitBranch />
        <span>{view === 'metricsetup' ? '配置任务 · 工作区待创建' : branch}</span>
      </button>
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
function PrototypeSession({
  branch,
  composer,
  configId,
  draft,
  session,
  sessionFlow,
  setDraft,
  setModal,
  setNotice,
  setSession,
  view,
  weekly
}) {
  return (
    <section className="session-pane" aria-label="分支会话">
      <header className="session-head">
        <GitBranch />
        <strong>{view === 'metricsetup' ? '指标配置任务' : branch}</strong>
        {weekly && (
          <button
            className="btn btn-icon btn-ghost"
            aria-label="查看分支会话"
            onClick={() =>
              setModal({
                type: 'sessions',
                title: `${branch} · 会话`
              })
            }
          >
            <History />
          </button>
        )}{' '}
        {weekly && (
          <button
            className="btn btn-icon btn-ghost"
            aria-label="开始新会话"
            onClick={() => {
              setSession('新会话')
              setDraft('')
            }}
          >
            <Plus />
          </button>
        )}
      </header>
      {view !== 'metricsetup' && (
        <div className="session-tabs" role="tablist" aria-label="分支会话列表">
          {[
            ['W39', 'v0.5'],
            ['W38', 'v0.4']
          ].map(([w, v]) => (
            <button
              role="tab"
              aria-selected={session === w}
              key={w}
              aria-label={`${v} · ${w} 会话`}
              onClick={() => setSession(w)}
            >
              <span>Claude Code</span>
              <small>
                {v} · {w}
              </small>
            </button>
          ))}
        </div>
      )}
      <div className="session-caption">
        <MessageSquare />
        <span>
          {view === 'metricsetup'
            ? `配置任务 · ${configId}`
            : `${session === 'W38' ? 'v0.4' : 'v0.5'} · ${session} · ${sessionFlow}`}
        </span>
      </div>
      <div className="session-empty">
        <MessageSquare />
        <span>会话记录待接入</span>
      </div>
      <div className="composer" ref={composer}>
        <Field
          label="会话输入"
          value={draft}
          onChange={setDraft}
          rows={3}
          placeholder="与会话讨论，或直接编辑右侧…"
        />
        <div>
          <span>Claude Code</span>
          <button
            className="btn btn-icon btn-ghost"
            aria-label="发送（原型未接入）"
            onClick={() => setNotice('会话尚未连接；输入已保留，未发送')}
          >
            <ArrowUp />
          </button>
        </div>
      </div>
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
