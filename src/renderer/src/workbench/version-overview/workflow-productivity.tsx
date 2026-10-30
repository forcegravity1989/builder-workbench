import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'
import type { VersionCatalogState } from '../use-version-catalog'
import { summarizeWorkflow, workflowMetricDisplay } from './workflow-evidence'
import { useWorkflowEvidence } from './use-workflow-evidence'
import { workflowReferences } from './read-workflow-evidence'
import { openEvidenceUrl, timeLabel } from './overview-time'

export function WorkflowProductivity({
  catalog,
  plan,
  version,
  revision,
  planState,
  sourceReady
}: {
  catalog: VersionCatalogState
  plan: PlanningMaterial | null
  version: string
  revision?: string
  planState: 'ready' | 'missing' | 'loading' | 'error'
  sourceReady: boolean
}) {
  const evidence = useWorkflowEvidence(catalog, plan, version, revision, sourceReady)
  const empty = plan
    ? workflowReferences(plan).map((reference) => ({
        reference,
        title: '',
        issueUrl: '',
        reports: [],
        problems: []
      }))
    : []
  const metrics = summarizeWorkflow(evidence.value?.tasks ?? empty)
  const readable = evidence.value?.tasks.filter((task) => task.reports.length) ?? []
  return (
    <section className="bwo-goal" aria-label="AI workflow 生产力">
      <div className="bwo-workflow-heading">
        <h2>AI workflow 生产力</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={evidence.refresh}
          disabled={!plan || evidence.loading}
        >
          <RefreshCw className={evidence.loading ? 'animate-spin' : ''} />
          刷新指标
        </Button>
      </div>
      <p className="bwo-muted mt-2">
        {planState === 'error'
          ? '统计范围未知'
          : plan
            ? `本版目标内 ${empty.length} 项 Issue`
            : planState === 'loading'
              ? '正在读取统计范围…'
              : '本版尚无目标任务'}
        {evidence.value
          ? ` · ${readable.length} 项有报告`
          : evidence.loading
            ? sourceReady
              ? ' · 正在后台读取报告…'
              : ' · 等待版本来源…'
            : ''}
        {evidence.value && (
          <span title="北京时间 UTC+08:00"> · 读取于 {timeLabel(evidence.value.readAt)}</span>
        )}
      </p>
      <div className="bwo-productivity">
        {metrics.map((metric) => {
          const display = workflowMetricDisplay(metric)
          return (
            <div key={metric.key}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="bwo-metric-label">{metric.label} ⓘ</button>
                </TooltipTrigger>
                <TooltipContent className="max-w-80">{display.hint}</TooltipContent>
              </Tooltip>
              <strong>
                {metric.samples
                  ? display.value
                  : empty.length || planState === 'error'
                    ? '未知'
                    : '—'}
              </strong>
              <span className="bwo-muted">{display.caption}</span>
            </div>
          )
        })}
      </div>
      {evidence.error && (
        <p role="alert" className="text-xs text-destructive">
          {evidence.error}
          {evidence.value ? '；保留上次读数。' : '；当前读数未知。'}
        </p>
      )}
      {evidence.value && (
        <details className="bwo-muted mt-3">
          <summary>
            报告来源与未读取范围{evidence.value.stale ? ' · 刷新失败，当前为上次读数' : ''}
          </summary>
          <p className="mt-2">有报告不代表每项都有结论；缺报告、覆盖不足或冲突的任务保留未知。</p>
          {metrics.map((metric) => (
            <p key={metric.key}>
              {metric.label}：{metric.samples} 项有结论 · {metric.unknown} 项未知
            </p>
          ))}
          {readable.map((task) => (
            <p
              key={`${task.reference.provider}:${task.reference.repository}:${task.reference.number}`}
              className="mt-2"
            >
              #{task.reference.number}
              {task.reports.map((item) => (
                <button
                  className="bwo-link ml-3"
                  key={item.revision}
                  onClick={() => openEvidenceUrl(item.url)}
                  title={`方法：${item.report.method}；六项原始记录见来源评论`}
                >
                  指标评论 ↗
                </button>
              ))}
            </p>
          ))}
          {evidence.value.problems.map((problem) => (
            <p className="text-destructive" key={problem}>
              {problem}
            </p>
          ))}
        </details>
      )}
    </section>
  )
}
