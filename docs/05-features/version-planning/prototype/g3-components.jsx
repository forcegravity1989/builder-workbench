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
  ArrowUp
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
      send: ArrowUp
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
          <IconButton
            name={editing ? 'check' : 'edit'}
            label={editing ? '结束编辑目标' : '编辑目标'}
            onClick={() => setEditing(!editing)}
          />
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
            <div className="g3-delivery">
              {editing ? (
                <Field
                  label="交付内容"
                  value={goal.deliverable}
                  onChange={(v) => update('deliverable', v)}
                  placeholder="交出什么可使用或可检查的成果"
                />
              ) : (
                <>
                  <h3>交付内容</h3>
                  <Lines text={goal.deliverable} />
                </>
              )}
            </div>
            <div className="g3-acceptance">
              {editing ? (
                <Field
                  label="验收标准"
                  value={goal.acceptance}
                  onChange={(v) => update('acceptance', v)}
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
                    name="arrow"
                    label={`开工 #${task.number}（G2 衔接）`}
                    onClick={() => startTask(task)}
                  />
                </div>
              ))
            ) : (
              <p className="g3-empty">与计划助手核对已有 Issue，再按交付内容拆解。</p>
            )}
          </div>
        </div>
      )}
    </article>
  )
}
export function ReviewItem({ item, update, locate }) {
  const [editing, setEditing] = useState(false)
  return (
    <article className="g3-review-item">
      <div className="g3-review-top">
        <span className="g3-id">{item.id}</span>
        <strong>{item.title}</strong>
        <span className="g3-status">{item.status}</span>
      </div>
      <p>{item.requirement}</p>
      <div className="g3-review-meta">
        <a
          href="https://github.com/forcegravity1989/builder-workbench/issues/385"
          target="_blank"
          rel="noreferrer"
        >
          {item.source}
        </a>
        <IconButton name="arrow" label={`查看目标 ${item.goal}`} onClick={locate} />
      </div>
      {editing ? (
        <div className="g3-response-editor">
          <Field
            label="回应与修改位置"
            value={item.response}
            onChange={(response) => update({ response })}
            placeholder="写清决定、修改位置；暂不采纳时说明原因"
          />
          <label>
            握手进展
            <select
              aria-label="握手进展"
              value={item.status}
              onChange={(e) => update({ status: e.target.value })}
            >
              <option>待讨论</option>
              <option>待 Leader 确认</option>
              <option>已与 Leader 确认</option>
            </select>
          </label>
          <IconButton name="check" label="结束编辑回应" onClick={() => setEditing(false)} />
        </div>
      ) : (
        <>
          {item.response && (
            <div className="g3-response">
              <strong>Builder 回应</strong>
              <p>{item.response}</p>
            </div>
          )}
          <IconButton
            name="edit"
            label={item.response ? '编辑回应' : '记录回应'}
            onClick={() => setEditing(true)}
          />
        </>
      )}
    </article>
  )
}
