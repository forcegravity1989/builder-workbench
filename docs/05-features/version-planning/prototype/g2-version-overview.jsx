import { IconAction } from './g2-icon-action.jsx'
// React is required by the shared bundle JSX factory.
// eslint-disable-next-line no-unused-vars
const { React, GitPullRequest, ClipboardCheck, PackageCheck } = window.BWPrototypeDependencies
export function VersionOverview({ version, plan, issues, readAt, onPlan, onTasks, onAcceptance }) {
  const goals = plan.goals
  const refs = plan.tasks
  const read = refs.map((r) => issues.find((i) => i.number === r.number)).filter(Boolean)
  const open = read.filter((i) => i.state === 'OPEN').length
  const closed = read.filter((i) => i.state === 'CLOSED').length
  return (
    <div className="page-content version-report">
      <div className="page-title">
        <div>
          <h1>{version} 版本总览</h1>
          <p>从计划承诺到交付结果，持续汇总本版工作。</p>
        </div>
        <span className="badge">发布信息未载入</span>
      </div>
      <div className="version-report-summary">
        <div>
          <small>计划承诺</small>
          <strong>{goals.length} 个目标</strong>
          <IconAction label="查看计划" onClick={onPlan} />
        </div>
        <div>
          <small>关联任务</small>
          <strong>
            {read.length
              ? `${closed} 已关闭 · ${open} 打开`
              : refs.length
                ? '任务状态未载入'
                : '暂无任务'}
          </strong>
          <IconAction label="查看本版任务" onClick={() => onTasks('all')} />
        </div>
        <div>
          <small>目标验收</small>
          <strong>未载入结论</strong>
          <IconAction label="查看验收" onClick={onAcceptance} />
        </div>
      </div>
      <div className="report-source-line">
        <GitPullRequest size={14} />
        {version === 'v0.7' ? (
          <a
            href="https://github.com/forcegravity1989/builder-workbench/pull/386"
            target="_blank"
            rel="noreferrer"
          >
            计划 PR #386 · 已合入快照
          </a>
        ) : plan.workflow?.archivePr ? (
          <a
            href={`https://github.com/forcegravity1989/builder-workbench/pull/${plan.workflow.archivePr.number}`}
            target="_blank"
            rel="noreferrer"
          >
            计划 PR #{plan.workflow.archivePr.number} · 状态未读取
          </a>
        ) : (
          '尚未制定计划'
        )}
        <span>
          Issue 当前快照 {readAt.slice(0, 10)} · 已载入 {read.length}/{refs.length}
        </span>
      </div>
      <h2>本版目标与交付</h2>
      {goals.map((goal) => {
        const linked = refs.filter((r) => r.goalId === goal.goalId)
        const loaded = linked.map((r) => issues.find((i) => i.number === r.number)).filter(Boolean)
        return (
          <article key={goal.goalId} className="report-goal">
            <div className="report-goal-title">
              <span className="goal-id">{goal.goalId}</span>
              <h3>{goal.title}</h3>
              <span className="badge">结果待确认</span>
            </div>
            <div className="report-goal-columns">
              <div>
                <label>计划交付</label>
                <p className="preline">{goal.deliverable}</p>
                <small>负责人 {goal.owner || '未填写'}</small>
              </div>
              <div>
                <label>当前事实</label>
                <p>
                  {loaded.length} / {linked.length} 个 Issue 已载入
                </p>
                <p>
                  {loaded.filter((i) => i.state === 'CLOSED').length} 已关闭 ·{' '}
                  {loaded.filter((i) => i.state === 'OPEN').length} 打开
                </p>
                <IconAction
                  label={`${goal.goalId} 查看目标任务`}
                  onClick={() => onTasks(goal.goalId)}
                />
              </div>
              <div>
                <label>验收结果</label>
                <p className="muted">尚未载入本目标的实际交付、证据与人工结论。</p>
                <IconAction label={`${goal.goalId} 查看验收`} onClick={onAcceptance} />
              </div>
            </div>
          </article>
        )
      })}
      {!goals.length && (
        <div className="empty">
          <PackageCheck size={24} />
          <h3>尚未制定本版目标</h3>
          <p>先进入计划，明确本版目标与交付承诺。</p>
          <IconAction label="进入计划" onClick={onPlan} />
        </div>
      )}
      <div className="report-bottom">
        <section className="card">
          <h2>
            <PackageCheck size={16} /> 交付物与发布
          </h2>
          <p className="muted">发布记录、交付包与对应验收证据尚未载入。</p>
        </section>
        <section className="card">
          <h2>
            <ClipboardCheck size={16} /> 遗留与后续
          </h2>
          <p className="muted">
            按验收中确认的遗留项与后续安排汇总；不把全部开放 Issue 自动当作遗留。
          </p>
        </section>
      </div>
    </div>
  )
}
