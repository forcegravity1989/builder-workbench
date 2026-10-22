import { IconAction } from './g2-icon-action.jsx'
// React is required by the shared bundle JSX factory.
// eslint-disable-next-line no-unused-vars
const { React, GitPullRequest, ClipboardCheck, PackageCheck } = window.BWPrototypeDependencies
/**
 * 高保真修订 9（2026-10-22，人确认方向「最简、表格周报风格」）：版本总览与生产
 * version-overview-page 同构——事实区（承诺/任务/纪要/验收入口）＋目标周报表
 * （目标｜计划承诺｜关联 Issue｜人工验收｜遗留/下一步）。演示数据为内存快照；
 * 未载入/未记录项如实标注，不装绿（生产同口径：信号只从数据推导）。
 */
export function VersionOverview({ version, plan, issues, readAt, onPlan, onTasks, onAcceptance }) {
  const goals = plan.goals
  const refs = plan.tasks
  const read = refs.map((r) => issues.find((i) => i.number === r.number)).filter(Boolean)
  const open = read.filter((i) => i.state === 'OPEN').length
  const closed = read.filter((i) => i.state === 'CLOSED').length
  const archivePr = plan.workflow?.archivePr
  const minutes = plan.minutes
  return (
    <div className="page-content version-report">
      <div className="page-title">
        <div>
          <h1>{version} 版本总览</h1>
          <p>
            只读派生自主干已提交材料与原生登记 ·{' '}
            {archivePr ? (
              <span>
                计划归档 PR #{archivePr.number}（合入状态薄读取，未读到保持未知）
              </span>
            ) : (
              <span>计划归档 PR 未记录</span>
            )}{' '}
            · Issue 快照 {readAt.slice(0, 10)} · 已载入 {read.length}/{refs.length}
          </p>
        </div>
        <span className="badge">发布证据未探测（不猜）</span>
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
          <small>会议纪要</small>
          <strong>
            {minutes
              ? `共识 ${minutes.consensus.length} · 遗留 ${minutes.followups.filter((f) => f.closed).length}/${minutes.followups.length} 闭环${minutes.confirmed ? ' · 人已确认' : ''}`
              : '纪要未记录'}
          </strong>
        </div>
        <div>
          <small>目标验收</small>
          <strong>逐条如实（见表）</strong>
          <IconAction label="查看验收" onClick={onAcceptance} />
        </div>
      </div>
      <h2>
        <GitPullRequest size={15} /> 目标周报表
      </h2>
      <table className="version-report-table">
        <thead>
          <tr>
            <th>目标</th>
            <th>计划承诺</th>
            <th>关联 Issue</th>
            <th>人工验收</th>
            <th>遗留 / 下一步</th>
          </tr>
        </thead>
        <tbody>
          {goals.map((goal, index) => {
            const label = `G${index + 1}`
            const linked = refs.filter((r) => r.goalId === goal.goalId)
            const loaded = linked
              .map((r) => issues.find((i) => i.number === r.number))
              .filter(Boolean)
            const done = loaded.filter((i) => i.state === 'CLOSED').length
            return (
              <tr key={goal.goalId}>
                <td>
                  <span className="goal-id">{label}</span> {goal.title}
                  <small>
                    负责人 {goal.owner || '待明确'}
                    {goal.deadline ? ` · ${goal.deadline}` : ''}
                  </small>
                </td>
                <td>
                  <span className="preline">{goal.deliverable || '交付约定未记录'}</span>
                  {goal.metricTargets?.length ? (
                    <small>
                      指标：
                      {goal.metricTargets
                        .map((t) => `${t.ref?.name ?? t.ref} → ${t.target}`)
                        .join('；')}
                    </small>
                  ) : null}
                </td>
                <td>
                  {loaded.length
                    ? `${done}/${linked.length} 已关闭`
                    : linked.length
                      ? `${linked.length} 条引用（状态未载入）`
                      : '无引用'}
                  <IconAction label={`${label} 查看目标任务`} onClick={() => onTasks(goal.goalId)} />
                </td>
                <td>
                  <span className="badge">结论未记录</span>
                  <small>人工结论在验收屏逐条记录；不由 Issue 状态推断</small>
                </td>
                <td>
                  <span className="muted">
                    按验收确认的遗留与下一步汇总；开放 Issue 不自动当遗留。
                  </span>
                </td>
              </tr>
            )
          })}
          {!goals.length && (
            <tr>
              <td colSpan={5} className="muted">
                尚未制定本版目标：先进入计划，明确目标与交付承诺。
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="report-bottom">
        <section className="card">
          <h2>
            <PackageCheck size={16} /> 交付物与发布
          </h2>
          <p className="muted">
            归档 PR 合入状态按记录引用薄读取，读不到保持未知；发布证据待接入发布记录检索后
            如实呈现，不猜、不以 PR 合入冒充发布。
          </p>
        </section>
        <section className="card">
          <h2>
            <ClipboardCheck size={16} /> 遗留与后续
          </h2>
          <p className="muted">
            会议遗留以纪要 closed 标记计数为准；验收遗留与下一步按人工确认条目汇总，
            不与 Issue 状态混算。
          </p>
        </section>
      </div>
    </div>
  )
}
