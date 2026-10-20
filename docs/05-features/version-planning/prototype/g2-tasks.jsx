// React is required by the shared bundle JSX factory.
// eslint-disable-next-line no-unused-vars
const { React, ArrowRight, ExternalLink, ListTodo } = window.BWPrototypeDependencies

export function ScopedTasks({
  version,
  plan,
  issues,
  goal,
  setGoal,
  search,
  setSearch,
  onDetail,
  onAction,
  hasWorkspace
}) {
  const references = plan.tasks
  const goals = plan.goals
  const scoped = references.filter((ref) => goal === 'all' || ref.goalId === goal)
  const rows = scoped
    .map((ref) => ({
      ...issues.find((item) => item.number === ref.number),
      number: ref.number,
      goalId: ref.goalId
    }))
    .filter(
      (item) =>
        (item.title || '').toLowerCase().includes(search.toLowerCase()) ||
        String(item.number).includes(search)
    )
  return (
    <div className="page-content native-task-page">
      <div className="page-title">
        <div>
          <h1>任务</h1>
          <p>{version} · Builder Workbench</p>
        </div>
      </div>
      <div className="task-goal-tabs" aria-label="按目标查看任务">
        <button aria-pressed={goal === 'all'} onClick={() => setGoal('all')}>
          全部目标 <small>{references.length}</small>
        </button>
        {goals.map((g) => (
          <button
            key={g.goalId}
            aria-pressed={goal === g.goalId}
            onClick={() => setGoal(g.goalId)}
            title={g.title}
          >
            {g.goalId}
            <small>{references.filter((r) => r.goalId === g.goalId).length}</small>
          </button>
        ))}
      </div>
      <div className="task-source-row">
        <span>
          <ListTodo size={14} /> Issues
        </span>
        <span>GitHub · builder-workbench</span>
        <input
          aria-label="搜索当前范围的任务"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索本版任务…"
        />
      </div>
      {goal !== 'all' && (
        <div className="task-goal-caption">
          <strong>{goal}</strong>
          {goals.find((g) => g.goalId === goal)?.title}
        </div>
      )}
      <div className="native-task-table">
        <div className="native-task-columns native-task-head">
          <span>ID</span>
          <span>标题 / 上下文</span>
          <span>负责人</span>
          <span>状态</span>
          <span>更新</span>
          <span />
        </div>
        {rows.map((item) => (
          <div className="native-task-columns native-task-row" key={item.number}>
            <button
              className="native-issue-id"
              disabled={!item.title}
              onClick={() => onDetail(item)}
            >
              <span className="issue-circle" />#{item.number}
            </button>
            <button
              className="native-task-title"
              disabled={!item.title}
              onClick={() => onDetail(item)}
            >
              <strong>{item.title?.replace(/^【[^】]+】/, '') || '内容未载入'}</strong>
              <small>
                {item.goalId} · Builder Workbench
                {hasWorkspace(item.number) ? ' · 已关联工作区' : ''}
              </small>
            </button>
            <span className="task-assignee">
              {item.title
                ? item.assignees?.nodes?.map((n) => n.login).join(', ') || '未指派'
                : '未读取'}
            </span>
            <span className="task-state">
              {item.state === 'OPEN' ? '打开' : item.state === 'CLOSED' ? '已关闭' : '未知'}
            </span>
            <span className="task-updated">{item.updatedAt?.slice(0, 10) || '未读取'}</span>
            {item.title ? (
              <button
                className={`action ${hasWorkspace(item.number) ? 'primary' : ''}`}
                aria-label={`#${item.number}${hasWorkspace(item.number) ? ' 打开工作区' : ' 开工'}`}
                onClick={() => onAction(item)}
              >
                {hasWorkspace(item.number) ? '打开' : '开工'}
                <ArrowRight size={13} />
              </button>
            ) : (
              <span>未就绪</span>
            )}
          </div>
        ))}
        {!rows.length && (
          <div className="empty">
            <ListTodo size={22} />
            <h3>{references.length ? '没有匹配的任务' : '本版尚未关联任务'}</h3>
            <p>
              {references.length
                ? '调整目标或搜索条件。'
                : '计划明确目标并关联 Issue 后，会在这里呈现。'}
            </p>
          </div>
        )}
      </div>
      <p className="task-list-note">
        {rows.length} / {references.length} 个本版任务 · Issue 状态与目标验收结论分别呈现
      </p>
    </div>
  )
}

export function SharedIssueDetail({ item, goal, origin, onBack, onAction, hasWorkspace }) {
  return (
    <div className="page-content shared-issue-detail">
      <div className="detail-top">
        <button className="action" onClick={onBack}>
          ← 返回{origin === 'plan' ? '计划' : '任务'}
        </button>
        <span>GitHub · builder-workbench</span>
        <a href={item.url} target="_blank" rel="noreferrer">
          <ExternalLink size={14} /> 原始 Issue
        </a>
      </div>
      <div className="page-title">
        <div>
          <p>
            #{item.number} · {goal?.goalId}
          </p>
          <h1>{item.title?.replace(/^【[^】]+】/, '')}</h1>
        </div>
        <button
          className={`action ${hasWorkspace ? 'primary' : ''}`}
          onClick={() => onAction(item)}
        >
          {hasWorkspace ? '打开工作区' : '开工'}
          <ArrowRight size={13} />
        </button>
      </div>
      <div className="issue-properties">
        <span>
          状态{' '}
          <strong>
            {item.state === 'OPEN' ? '打开' : item.state === 'CLOSED' ? '已关闭' : '未知'}
          </strong>
        </span>
        <span>
          负责人{' '}
          <strong>{item.assignees?.nodes?.map((n) => n.login).join(', ') || '未指派'}</strong>
        </span>
        <span>
          更新 <strong>{item.updatedAt?.slice(0, 10)}</strong>
        </span>
      </div>
      <div className="card">
        <h2>所属目标</h2>
        <h3>{goal?.title}</h3>
        <label>目标验收标准</label>
        <p className="preline">{goal?.acceptance}</p>
      </div>
      <p className="muted">
        详情区拟沿用 Orca 原生组件。原型没有复制 Issue 正文；可通过“原始 Issue”查看完整内容。
      </p>
    </div>
  )
}
