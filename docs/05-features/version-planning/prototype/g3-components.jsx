const {
  React,
  useState,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  Plus,
  X,
  Target,
  GitPullRequest,
  BrainCircuit,
  Pencil,
  Check,
  ArrowUp,
  MessageSquare,
  Copy
} = window.BWPrototypeDependencies
export { React }
export function Icon({ name, size = 16 }) {
  const Component =
    {
      down: ChevronDown,
      right: ChevronRight,
      arrow: ArrowUpRight,
      plus: Plus,
      close: X,
      target: Target,
      pr: GitPullRequest,
      agent: BrainCircuit,
      edit: Pencil,
      check: Check,
      send: ArrowUp,
      annotate: MessageSquare,
      copy: Copy
    }[name] || Target
  return <Component size={size} aria-hidden="true" />
}
export function IconButton({ name, label, href, className = '', ...props }) {
  const [tip, setTip] = useState(null)
  const show = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setTip({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 232)),
      top: rect.bottom + 32 > window.innerHeight ? rect.top - 32 : rect.bottom + 4
    })
  }
  const Control = href ? 'a' : 'button'
  return (
    <span className="g3-icon-wrap" onMouseLeave={() => setTip(null)}>
      <Control
        className={`g3-icon-button ${className}`}
        aria-label={label}
        href={href}
        {...(href ? { target: '_blank', rel: 'noreferrer' } : {})}
        {...props}
        onMouseEnter={show}
        onFocus={show}
        onBlur={() => setTip(null)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setTip(null)
          }
        }}
      >
        <Icon name={name} />
      </Control>
      {tip && (
        <span className="g3-tooltip" aria-hidden="true" style={tip}>
          {label}
        </span>
      )}
    </span>
  )
}
export function Field({ label, value, onChange, placeholder, rows = 2 }) {
  return (
    <label className="g3-field">
      <span>{label}</span>
      <textarea
        rows={rows}
        value={value || ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}
function Lines({ text, empty = '待明确' }) {
  return (
    <div className="g3-lines">
      {(text || empty)
        .split('\n')
        .filter((line) => line.trim())
        .map((line, i) => (
          <p key={i}>{line}</p>
        ))}
    </div>
  )
}
export function GoalRow({
  goal,
  tasks,
  expanded,
  toggle,
  update,
  assistant,
  startTask,
  annotate,
  editing,
  setEditing
}) {
  return (
    <article className={`g3-goal ${expanded ? 'open' : ''}`} id={`goal-${goal.goalId}`}>
      <div className="g3-goal-head">
        <button
          className="g3-goal-toggle"
          onClick={toggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? '收起' : '展开'} ${goal.goalId}`}
        >
          <Icon name={expanded ? 'down' : 'right'} size={14} />
          <span className="g3-goal-id">{goal.goalId}</span>
          {!editing && <strong>{goal.title || '待明确目标'}</strong>}
        </button>
        {editing && (
          <textarea
            className="g3-title-input"
            rows={1}
            aria-label={`${goal.goalId} 目标`}
            value={goal.title}
            onChange={(e) => update('title', e.target.value)}
          />
        )}
        <span className="g3-goal-count">{tasks.length} Issue</span>
        {expanded && (
          <>
            <IconButton
              name="annotate"
              label={`批注 ${goal.goalId}（会上意见记入速记）`}
              onClick={() => annotate(`${goal.goalId} 目标`)}
            />
            <IconButton
              name={editing ? 'check' : 'edit'}
              label={editing ? '结束编辑目标' : '编辑目标'}
              onClick={() => setEditing(!editing)}
            />
          </>
        )}
      </div>
      {!expanded && (
        <div className="g3-goal-meta">
          <span>{goal.owner || '负责人待明确'}</span>
          {goal.deadline && <span>{goal.deadline}</span>}
        </div>
      )}
      {expanded && (
        <div className="g3-goal-body">
          <div className="g3-goal-meta">
            {editing ? (
              <>
                <label>
                  负责人{' '}
                  <input
                    aria-label={`${goal.goalId} 负责人`}
                    value={goal.owner || ''}
                    onChange={(e) => update('owner', e.target.value)}
                  />
                </label>
                <label>
                  计划完成{' '}
                  <input
                    aria-label={`${goal.goalId} 计划完成`}
                    value={goal.deadline || ''}
                    placeholder="日期或版本"
                    onChange={(e) => update('deadline', e.target.value)}
                  />
                </label>
              </>
            ) : (
              <>
                <span>{goal.owner || '负责人待明确'}</span>
                <span>{goal.deadline || '计划完成待明确'}</span>
              </>
            )}
          </div>
          <div className="g3-commitment">
            <div className="g3-acceptance">
              {editing ? (
                <Field
                  label="验收标准"
                  value={goal.acceptance}
                  onChange={(v) => update('acceptance', v)}
                  rows={3}
                  placeholder="谁做什么操作、看到什么结果；涉及数值时写口径和目标值"
                />
              ) : (
                <>
                  <h3>验收标准</h3>
                  <Lines text={goal.acceptance} />
                </>
              )}
            </div>
          </div>
          <div className="g3-task-head">
            <h3>
              关联 Issue <span>{tasks.length}</span>
            </h3>
            <IconButton name="agent" label="让计划助手拆解 / 关联 Issue" onClick={assistant} />
          </div>
          <div className="g3-tasks">
            {tasks.length ? (
              tasks.map((task) => (
                <div className="g3-task" key={task.number}>
                  <a
                    href={
                      task.url ||
                      `https://github.com/forcegravity1989/builder-workbench/issues/${task.number}`
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="g3-id">#{task.number}</span>
                    {task.title?.replace(/^【.*?】/, '') || '标题未读到'}
                  </a>
                  <span className="g3-task-state">
                    {task.state === 'CLOSED'
                      ? '已关闭'
                      : task.state === 'OPEN'
                        ? '开放'
                        : '状态未知'}
                  </span>
                  <IconButton
                    name="annotate"
                    label={`批注 #${task.number}（拆解评审意见记入速记）`}
                    onClick={() => annotate(`${goal.goalId} · #${task.number}`)}
                  />
                  <IconButton
                    name="arrow"
                    label={`开工 #${task.number}（G2 衔接）`}
                    onClick={() => startTask(task)}
                  />
                </div>
              ))
            ) : (
              <p className="g3-empty">与计划助手核对已有 Issue，再按验收标准拆解。</p>
            )}
          </div>
        </div>
      )}
    </article>
  )
}
export function MinutesCard({ minutes, sections, update, assistant }) {
  const [editing, setEditing] = useState(false)
  return (
    <article className="g3-minutes">
      <div className="g3-minutes-head">
        <span className={`g3-status ${minutes.confirmed ? 'confirmed' : ''}`}>
          {minutes.confirmed ? '已人工确认' : '待人工确认'}
        </span>
        <span className="g3-muted">{minutes.sources}</span>
        <span className="g3-minutes-actions">
          <IconButton
            name={editing ? 'check' : 'edit'}
            label={editing ? '结束编辑纪要' : '编辑纪要'}
            onClick={() => setEditing(!editing)}
          />
          <IconButton name="agent" label="与计划助手基于纪要调整目标" onClick={assistant} />
        </span>
      </div>
      {editing
        ? sections.map(([key, label]) => (
            <Field
              key={key}
              label={label}
              rows={2}
              value={minutes.sections[key]}
              onChange={(value) =>
                update({ sections: { ...minutes.sections, [key]: value } })
              }
            />
          ))
        : sections.map(([key, label]) => (
            <div className="g3-minutes-section" key={key}>
              <strong>{label}</strong>
              {minutes.sections[key] ? (
                <p>{minutes.sections[key]}</p>
              ) : (
                <p className="g3-muted">无</p>
              )}
            </div>
          ))}
      <div className="g3-minutes-foot">
        <button onClick={() => update({ confirmed: !minutes.confirmed })}>
          {minutes.confirmed ? '已人工确认 · 撤销' : '标记人工确认'}
        </button>
        <span className="g3-muted">纪要独立保存，认可随归档 PR 评审表达。</span>
      </div>
    </article>
  )
}
export function AnnotationTray({ target, annotations, onClose, onRecord, onSend }) {
  const [draft, setDraft] = useState('')
  const copy = async () => {
    const text = annotations.map((item) => `- [${item.object}] ${item.text}`).join('\n')
    await navigator.clipboard?.writeText(text)
  }
  return (
    <aside className="g3-annotation-tray" aria-label="在线批注速记窗">
      <header>
        <Icon name="annotate" size={14} />
        <strong>在线批注</strong>
        <span className="g3-muted">{target}</span>
        <IconButton name="close" label="收起批注窗" onClick={onClose} />
      </header>
      {annotations.length > 0 && (
        <ul>
          {annotations.map((item) => (
            <li key={item.id}>
              <span className="g3-id">{item.object}</span>
              <p>{item.text}</p>
            </li>
          ))}
        </ul>
      )}
      <textarea
        rows={2}
        aria-label="批注内容"
        placeholder={`记录对 ${target} 的评审意见`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <footer>
        <button
          disabled={!draft.trim()}
          onClick={() => {
            onRecord(draft.trim())
            setDraft('')
          }}
        >
          记录
        </button>
        <button disabled={!annotations.length} onClick={copy}>
          <Icon name="copy" size={13} /> 复制
        </button>
        <button className="primary" disabled={!annotations.length} onClick={onSend}>
          <Icon name="send" size={13} /> 发送给计划助手
        </button>
      </footer>
    </aside>
  )
}
