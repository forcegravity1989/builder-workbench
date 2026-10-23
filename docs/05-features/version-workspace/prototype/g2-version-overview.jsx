import { IconAction } from './g2-icon-action.jsx'
// React is required by the shared bundle JSX factory.
// eslint-disable-next-line no-unused-vars
const { React, GitPullRequest } = window.BWPrototypeDependencies
/**
 * 高保真修订 9（2026-10-22，人确认方向「最简、表格周报风格」；同夜按人授权把
 * 事实区构成对齐生产）：版本总览与生产 version-overview-page 同构——页头
 * （状态角标＋来源行＋计划屏/验收屏/本版任务按钮）＋事实区五格（工作区登记
 * 现算／计划归档 PR／验收归档 PR／发布证据／会议纪要）＋目标周报表（目标｜
 * 计划承诺｜关联 Issue｜人工验收｜遗留/下一步）。演示数据为内存快照：演示不
 * 探测 provider 状态，未载入/未记录项如实标注，不装绿（生产同口径：信号只从
 * 数据推导）。
 */
const TREE_LABELS = {
  plan: '计划树',
  acceptance: '验收树',
  goal: '目标协作树',
  issue: 'Issue 执行树'
}
export function VersionOverview({
  version,
  status,
  plan,
  trees,
  issues,
  readAt,
  onPlan,
  onTasks,
  onAcceptance
}) {
  const goals = plan.goals
  const refs = plan.tasks
  const read = refs.map((r) => issues.find((i) => i.number === r.number)).filter(Boolean)
  const archivePr = plan.workflow?.archivePr
  const minutes = plan.minutes
  const followupsClosed = minutes ? minutes.followups.filter((f) => f.closed).length : 0
  const workspaceLabels = [...new Set(trees.map((t) => TREE_LABELS[t.role] ?? t.role))]
  return (
    <div className="page-content version-report">
      <div className="page-title">
        <div>
          <h1>{version} 版本总览</h1>
          <p>
            只读派生自主干已提交材料与原生登记 · Issue 快照 {readAt.slice(0, 10)} · 已载入{' '}
            {read.length}/{refs.length}
          </p>
        </div>
        <span className="report-nav">
          <span className="badge">{status}</span>
          <button type="button" className="report-nav-btn" onClick={onPlan}>
            计划屏
          </button>
          <button type="button" className="report-nav-btn" onClick={onAcceptance}>
            验收屏
          </button>
          <button type="button" className="report-nav-btn" onClick={() => onTasks('all')}>
            本版任务
          </button>
        </span>
      </div>
      <div className="version-report-summary">
        <div>
          <small>工作区（登记现算）</small>
          <strong>
            {trees.length
              ? `${trees.length} 棵存活：${workspaceLabels.join('、')}`
              : '已清理或未准备（登记缺失）'}
          </strong>
        </div>
        <div>
          <small>计划归档 PR</small>
          <strong>{archivePr ? `#${archivePr.number} · 未知（演示不探测）` : '未记录'}</strong>
        </div>
        <div>
          <small>验收归档 PR</small>
          <strong>未记录</strong>
        </div>
        <div>
          <small>发布证据</small>
          <strong className="report-cell-note">未探测（发布记录检索未接入，不猜）</strong>
        </div>
        <div>
          <small>会议纪要</small>
          <strong className="report-cell-note">
            {minutes
              ? `共识 ${minutes.consensus.length} · 遗留 ${followupsClosed}/${minutes.followups.length} 闭环${minutes.confirmed ? ' · 人已确认' : ' · 未确认'}`
              : '纪要未记录'}
          </strong>
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
    </div>
  )
}
