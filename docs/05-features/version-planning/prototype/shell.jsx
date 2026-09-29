import { React, useEffect, useRef, useState } from 'react'
import {
  BookOpen,
  CalendarClock,
  CalendarRange,
  CircleHelp,
  ClipboardCheck,
  GitBranch,
  LayoutDashboard,
  ListTodo,
  MessageSquare
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
      {!['monday', 'friday'].includes(view) && (
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
      )}
    </aside>
  )
}
function PrototypeSession({ composer, draft, sessionState, width }) {
  return (
    <section className="session-pane" style={{ width }} aria-label="Orca 原生会话工作区">
      <div className="native-workspace-placeholder">
        <MessageSquare />
        <h2>
          Orca 原生会话<sup>1</sup>
        </h2>
        <p className="prototype-session-state" role="status">
          {sessionState === 'empty' ? '尚未打开会话' : '会话已打开'}
        </p>
      </div>
      {draft && (
        <details className="prototype-request" open ref={composer}>
          <summary>
            会话内容<sup>1</sup>
          </summary>
          <pre>{draft}</pre>
        </details>
      )}
    </section>
  )
}
function PrototypeSplitter({ onResize }) {
  const separator = useRef(null)
  const dragging = useRef(false)
  const [position, setPosition] = useState(0)
  useEffect(() => {
    const element = separator.current
    const observer = new ResizeObserver(() => {
      const left = element.previousElementSibling.getBoundingClientRect().width
      const right = element.nextElementSibling.getBoundingClientRect().width
      if (left + right) {
        setPosition(Math.round((left / (left + right)) * 100))
      }
    })
    observer.observe(element.previousElementSibling)
    observer.observe(element.nextElementSibling)
    return () => observer.disconnect()
  }, [])
  function resize(element, offset) {
    const left = element.previousElementSibling.getBoundingClientRect().width
    const right = element.nextElementSibling.getBoundingClientRect().width
    const available = left + right
    onResize(Math.max(available * 0.2, Math.min(available * 0.6, offset)))
  }
  return (
    <div
      ref={separator}
      className="prototype-splitter"
      role="separator"
      aria-label="调整会话与业务板宽度"
      aria-orientation="vertical"
      aria-valuemin={20}
      aria-valuemax={60}
      aria-valuenow={position}
      tabIndex={0}
      title="左右拖动调整宽度；双击恢复默认"
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return
        }
        event.preventDefault()
        dragging.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!dragging.current) {
          return
        }
        const left = event.currentTarget.previousElementSibling.getBoundingClientRect()
        resize(event.currentTarget, event.clientX - left.left)
      }}
      onPointerUp={(event) => {
        dragging.current = false
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      }}
      onLostPointerCapture={() => {
        dragging.current = false
      }}
      onDoubleClick={() => onResize(undefined)}
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) {
          return
        }
        event.preventDefault()
        const left = event.currentTarget.previousElementSibling.getBoundingClientRect().width
        const right = event.currentTarget.nextElementSibling.getBoundingClientRect().width
        resize(
          event.currentTarget,
          left + (left + right) * (event.key === 'ArrowRight' ? 0.05 : -0.05)
        )
      }}
    />
  )
}
function PrototypeHeader({
  branch,
  version,
  view,
  weekly,
  firstEntry,
  selectVersion,
  hasProblems,
  planningSaveState
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
      {weekly ? (
        <select
          className="input version-select"
          aria-label={view === 'monday' ? '计划版本' : '验收版本'}
          value={firstEntry ? '' : version}
          onChange={(event) => selectVersion(event.target.value)}
        >
          <option value="" disabled>
            待选择版本
          </option>
          {!firstEntry && <option value="v0.5">v0.5</option>}
          {!firstEntry && !hasProblems && view === 'friday' && <option value="v0.4">v0.4</option>}
          {hasProblems && (
            <>
              <option value="v0.3" disabled>
                v0.3 · 无法读取
              </option>
              <option value="v0.4" disabled>
                v0.4 · 无法读取
              </option>
            </>
          )}
        </select>
      ) : (
        <span className="page-state">builder-workbench</span>
      )}
      {weekly && !firstEntry && (
        <span className="page-state" role="status">
          {view === 'monday' ? planningSaveState : '草稿'}
        </span>
      )}
      <span className="header-spacer" />
      {weekly && (
        <span className="page-branch" title={branch}>
          <GitBranch />
          <span>{branch}</span>
        </span>
      )}
    </header>
  )
}
export { PrototypeSidebar, PrototypeSession, PrototypeHeader, PrototypeSplitter }
