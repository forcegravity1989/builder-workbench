import { snapshot, repository, formatTime } from './overview-data.js'
import {
  readWorkflowComment,
  workflowFields
} from '../../../../src/shared/workbench/workflow-report'
import { summarizeWorkflow } from '../../../../src/renderer/src/workbench/version-overview/workflow-evidence'
import { HintButton } from './overview-components.jsx'
// eslint-disable-next-line no-unused-vars
const { React, useState } = window.BWPrototypeDependencies

export function WorkflowProductivity({ plan, unplanned }) {
  const [source, setSource] = useState(snapshot.workflowSample)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const parsed = readWorkflowComment(source?.comment)
  const report =
    parsed.kind === 'ready' && parsed.issueUrl !== source?.issue?.url
      ? { kind: 'unknown', reason: '指标评论标记与来源 Issue 不一致' }
      : parsed
  const tasks = unplanned
    ? []
    : plan.tasks.filter((task) => plan.goals.some((goal) => goal.goalId === task.goalId))
  const count = new Set(tasks.map((task) => `${task.provider}:${task.repository}:${task.number}`))
    .size
  const inScope = tasks.some(
    (task) =>
      task.provider === 'github' &&
      task.repository.replace(/^https?:\/\//, '').replace(/\.git$/, '') ===
        repository.replace(/^https?:\/\//, '') &&
      task.number === source?.issue?.number
  )
  async function refresh() {
    setLoading(true)
    setError('')
    setNotice('')
    try {
      // Static preview rereads its captured source, not a pretend provider response.
      const response = await fetch(new URL('prototype/bw-snapshot.json', location.href), {
        cache: 'no-store'
      })
      if (!response.ok) {
        throw new Error(`来源快照读取失败（${response.status}）`)
      }
      const next = (await response.json()).workflowSample
      const result = readWorkflowComment(next?.comment)
      if (result.kind !== 'ready' || result.issueUrl !== next?.issue?.url) {
        throw new Error('未读取到归属明确的 workflow 指标评论')
      }
      setSource(next)
      setNotice('原型注释: 已重读本地来源快照；未发起远端评论查询，来源采集时间保持原值。')
    } catch (failure) {
      setError(`${failure.message}；保留上次读数，不将失败显示为0。`)
    } finally {
      setLoading(false)
    }
  }
  const metrics =
    report.kind === 'ready'
      ? report.metrics
      : workflowFields.map(([key, label, hint]) => ({ key, label, hint, value: '未知' }))
  const summary = summarizeWorkflow(
    report.kind === 'ready'
      ? [
          {
            reference: { provider: 'github', repository, number: source.issue.number },
            title: source.issue.title,
            issueUrl: source.issue.url,
            reports: [{ report, url: source.comment.url, revision: source.readAt }],
            problems: []
          }
        ]
      : []
  )
  return (
    <section className="ov-section" aria-labelledby="productivity">
      <div className="ov-workflow-heading">
        <h2 id="productivity">AI workflow 生产力</h2>
        <button className="ov-link" onClick={refresh} disabled={loading}>
          {loading ? '读取指标…' : '刷新指标 ↻'}
        </button>
      </div>
      <p className="muted">统计范围：本版目标内 {count} 项 Issue；由人纳入目标后参与统计。</p>
      <p className="ov-note">
        原型注释: 以下为 PR #505 指标评论的真实单任务读数样例，
        {inScope
          ? '已有目标关联'
          : `#${source?.issue?.number ?? '—'} 尚未纳入这份固定计划，不计入本版汇总`}
        。比率仅为这个样例的涉及任务数／可统计任务数；正式版按目标内 Issue
        汇总，此处独立刷新重读本地快照。
      </p>
      <div className="ov-productivity-metrics">
        {metrics.map((metric, index) => (
          <div key={metric.key}>
            <HintButton id={`metric-${metric.key}`} text={metric.hint} className="ov-metric-tip">
              {metric.label} ⓘ
            </HintButton>
            <strong>
              {summary[index]?.samples
                ? `${summary[index].involved}/${summary[index].samples}`
                : '未知'}
            </strong>
            <span>{metric.value}</span>
          </div>
        ))}
      </div>
      {report.kind === 'unknown' && (
        <p className="ov-error" role="status">
          {report.reason}
        </p>
      )}
      {error && (
        <p className="ov-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="ov-note" role="status">
          {notice}
        </p>
      )}
      <div className="ov-workflow-source">
        {source?.comment?.url && (
          <a className="ov-link" href={source.comment.url} target="_blank" rel="noreferrer">
            采集来源：PR #{source.pull?.number} 指标评论 ↗
          </a>
        )}
        <span>评论更新 · {formatTime(source?.comment?.updatedAt)}</span>
        <span>来源采集 · {formatTime(source?.readAt)}</span>
      </div>
    </section>
  )
}
