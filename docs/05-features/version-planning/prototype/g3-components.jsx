const {
  React,
  useEffect,
  useRef,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  Plus,
  X,
  Target,
  GitPullRequest,
  MessageSquare,
  Check,
  CircleHelp
} = window.BWPrototypeDependencies
import { advice, reviewState } from './g3-model.js'
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
      chat: MessageSquare,
      check: Check,
      help: CircleHelp
    }[name] || CircleHelp
  return <Component size={size} aria-hidden="true" />
}
export function Button({ children, primary, icon, ...props }) {
  return (
    <button className={`btn ${primary ? 'btn-primary' : 'btn-secondary'}`} {...props}>
      {icon && <Icon name={icon} />} {children}
    </button>
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
export function Dialog({ title, children, close, wide = false }) {
  const ref = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    const element = ref.current
    element?.focus()
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
      if (e.key === 'Tab') {
        const items = Array.from(
          element.querySelectorAll(
            'button:not([disabled]),a[href],input,textarea,select,[tabindex="0"]'
          )
        )
        if (!items.length) {
          return
        }
        const first = items[0],
          last = items.at(-1)
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === element)
        ) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    element?.addEventListener('keydown', handler)
    return () => {
      element?.removeEventListener('keydown', handler)
      previous?.focus()
    }
  }, [close])
  return (
    <div className="g3-overlay">
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`g3-dialog${wide ? ' wide' : ''}`}
      >
        <header>
          <h2>{title}</h2>
          <button className="g3-icon" aria-label="关闭弹窗" onClick={close}>
            <Icon name="close" />
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}
export function GoalCard({
  goal,
  tasks,
  expanded,
  toggle,
  update,
  coach,
  openTask,
  startTask,
  addTask,
  started,
  reading,
  revision
}) {
  return (
    <article className={`g3-goal${expanded ? ' open' : ''}`} id={`goal-${goal.goalId}`}>
      <div className="g3-goal-head">
        <button
          className="g3-icon"
          onClick={toggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? '收起' : '展开'} ${goal.goalId}`}
        >
          <Icon name={expanded ? 'down' : 'right'} />
        </button>
        <span className="g3-id">{goal.goalId}</span>
        {expanded && !reading ? (
          <textarea
            className="g3-goal-title"
            rows={1}
            aria-label={`${goal.goalId} 目标`}
            value={goal.title}
            onChange={(e) => update('title', e.target.value)}
            placeholder="为谁带来什么可判断的变化"
          />
        ) : (
          <button className="g3-title-button" onClick={toggle}>
            {goal.title || '待明确目标'}
          </button>
        )}
        <span className="g3-meta">{tasks.length} Issue</span>
      </div>
      <div className="g3-goal-sub">
        <span>{goal.owner || '负责人待明确'}</span>
        {goal.deadline && <span>{goal.deadline}</span>}
        {revision > 0 && <span>本次已修改</span>}
      </div>
      {expanded && (
        <div className="g3-goal-body">
          {reading ? (
            <dl className="g3-read-fields">
              <dt>交付什么</dt>
              <dd>{goal.deliverable || '待明确'}</dd>
              <dt>如何验收</dt>
              <dd>{goal.acceptance || '待明确'}</dd>
            </dl>
          ) : (
            <>
              <Field
                label="交付什么"
                value={goal.deliverable}
                onChange={(v) => update('deliverable', v)}
                placeholder="写出用户能使用或 Leader 能检查的交付内容"
              />
              <Field
                label="如何验收"
                value={goal.acceptance}
                onChange={(v) => update('acceptance', v)}
                placeholder="在什么场景，做什么操作，看到什么结果；有指标时明确口径与来源"
              />
              <div className="g3-inline-fields">
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
              </div>
            </>
          )}
          <div className="g3-coach">
            <Icon name="help" />
            <span>{advice[goal.goalId]?.question || '交付这些内容后，用户能做成什么？'}</span>
            <button onClick={() => coach(goal)}>
              推敲目标 <Icon name="arrow" size={13} />
            </button>
          </div>
          {goal.measure ? (
            <div className="g3-measure">
              <strong>衡量方式</strong>
              <span>{goal.measure}</span>
              <small>待核对口径与采集依据</small>
              {!reading && (
                <>
                  <button className="g3-text-action" onClick={() => coach(goal, 'measure')}>
                    编辑衡量
                  </button>
                  <button
                    className="g3-text-action"
                    onClick={() => {
                      update('measure', '')
                      update('measureFields', null)
                    }}
                  >
                    移除衡量
                  </button>
                </>
              )}
            </div>
          ) : (
            !reading && (
              <button className="g3-text-action" onClick={() => coach(goal, 'measure')}>
                ＋ 添加数值衡量（可选）
              </button>
            )
          )}
          <div className="g3-task-head">
            <strong>支撑这个目标的 Issue</strong>
            <button className="g3-text-action" onClick={() => addTask(goal)}>
              拆解 / 关联
            </button>
          </div>
          {tasks.length ? (
            tasks.map((task) => (
              <div className="g3-task" key={task.number}>
                <span
                  className="g3-state-dot"
                  aria-label={task.state === 'CLOSED' ? '已关闭' : '开放'}
                />
                <button className="g3-task-title" onClick={() => openTask(task)}>
                  <span className="g3-id">#{task.number}</span>{' '}
                  {task.title?.replace(/^【.*?】/, '') || '标题未读到'}
                </button>
                <span className="g3-task-state">{task.state === 'CLOSED' ? '已关闭' : '开放'}</span>
                <button className="g3-task-start" onClick={() => startTask(task)}>
                  {started.includes(task.number) ? '继续' : '开工'} <Icon name="arrow" size={13} />
                </button>
              </div>
            ))
          ) : (
            <div className="g3-empty-inline">
              尚未关联任务。先按交付结果拆解，或复用已有 Issue。
            </div>
          )}
        </div>
      )}
    </article>
  )
}
export function ReviewItem({ item, revisions, locate, respond }) {
  const state = reviewState(item, revisions)
  const labels = {
    pending: '待落实',
    addressed: 'Builder 已回应',
    deferred: '待 Leader 决定',
    stale: '内容已变，需复核'
  }
  return (
    <article className="g3-review-item">
      <div className="g3-review-top">
        <span className="g3-id">{item.id}</span>
        <strong>{item.text}</strong>
        <span className={`g3-status ${state === 'addressed' ? 'quiet' : ''}`}>{labels[state]}</span>
      </div>
      <div className="g3-review-meta">
        {item.issue ? (
          <a
            href={`https://github.com/forcegravity1989/builder-workbench/issues/${item.issue}`}
            target="_blank"
            rel="noreferrer"
          >
            来源 #{item.issue}
          </a>
        ) : (
          <span>{item.source}</span>
        )}
        <button onClick={() => locate(item.goal)}>
          {item.goal} · {item.target} <Icon name="arrow" size={12} />
        </button>
      </div>
      {item.response && (
        <div className="g3-response">
          <span>Builder 回应</span>
          <p>{item.response}</p>
          <small>修改依据：{item.evidence}</small>
        </div>
      )}
      <button className="g3-text-action" onClick={() => respond(item)}>
        {item.response ? '修改回应' : '记录如何落实'} <Icon name="arrow" size={13} />
      </button>
    </article>
  )
}
