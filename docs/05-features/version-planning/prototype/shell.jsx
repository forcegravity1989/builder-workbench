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
function PrototypeSession({ branch, composer, draft, sessionState, onStart, view, width }) {
  const label = view === 'friday' ? '验收' : '计划'
  return (
    <section className="session-pane" style={{ width }} aria-label="Orca 原生会话工作区">
      <header className="session-head">
        <GitBranch />
        <strong>{branch}</strong>
        <button className="btn btn-secondary" onClick={onStart}>
          新建{label}
        </button>
      </header>
      <div className="native-workspace-placeholder">
        <MessageSquare />
        <h2>复用 Orca 会话工作区</h2>
        <p className="prototype-session-state" role="status">
          {sessionState === 'empty'
            ? `尚未打开会话。点击上方“新建${label}”即可开始。`
            : sessionState === 'request'
              ? '原型示意：已新建并聚焦原生会话，处理请求已自动发送；等待模型说明，再由人确认是否修改文件。'
              : sessionState === 'workflow'
                ? `原型示意：已运行登记的${label}自动化，并打开、聚焦本次原生会话。`
                : '原型示意：此固定工作区已有原生会话。'}
        </p>
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
  review,
  setExpanded,
  setNotice,
  setTaskFilter,
  setVersion,
  version,
  view,
  weekly,
  firstEntry
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
      {weekly && firstEntry ? (
        <select
          className="input version-select"
          aria-label={`${view === 'monday' ? '计划' : '验收'}版本`}
          value=""
          onChange={() => {}}
        >
          <option value="">待选择版本</option>
          <option value="v0.3" disabled>
            v0.3 · 无法读取
          </option>
          <option value="v0.4" disabled>
            v0.4 · 无法读取
          </option>
        </select>
      ) : view === 'monday' ? (
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
      {weekly && !firstEntry && <span className="page-state">草稿</span>}
      <span className="header-spacer" />
      {view === 'friday' && (
        <button className="btn btn-ghost" onClick={review} disabled={firstEntry}>
          <ClipboardCheck />
          验收报告
        </button>
      )}
    </header>
  )
}
export { PrototypeSidebar, PrototypeSession, PrototypeHeader, PrototypeSplitter }
