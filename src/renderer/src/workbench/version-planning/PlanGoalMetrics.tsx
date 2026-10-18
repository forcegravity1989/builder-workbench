import { ChartNoAxesCombined, MessageSquarePlus, RefreshCw } from 'lucide-react'
import { metricRefKey } from '../../../../shared/workbench/metrics'
import type { VersionGoal } from '../../../../shared/workbench/version-material'
import type { usePlanMetrics } from './use-plan-metrics'

/** Read-only metric status; metric configuration remains a session/SOP action. */
export function PlanGoalMetrics({
  goal,
  metrics,
  prepare
}: {
  goal: VersionGoal
  metrics: ReturnType<typeof usePlanMetrics>
  prepare(): void
}) {
  return (
    <div className="vp-metrics">
      {goal.metricTargets.map((target) => {
        const key = metricRefKey(target.ref)
        const value = metrics.values[key]
        const reading =
          value?.status === 'ready' && value.readings.length === 1 ? value.readings[0] : null
        return (
          <div className="vp-metric" key={key}>
            <div className="vp-metric-row">
              <span className="vp-metric-name">
                <ChartNoAxesCombined size={14} />
                {target.ref.name}
              </span>
              <span className="vp-metric-value">
                <span>当前</span>
                <strong title={reading ? reading.collectedAt : '此来源和窗口尚无可信读数'}>
                  {reading ? `${reading.value}${reading.unit}` : 'Unknown'}
                </strong>
              </span>
              <span className="vp-metric-target">
                <span>目标</span>
                <strong>{target.target || 'Unknown'}</strong>
              </span>
              <button className="wb-btn wb-btn-sm" onClick={() => void metrics.refresh(target.ref)}>
                <RefreshCw size={14} />
                刷新指标
              </button>
            </div>
          </div>
        )
      })}
      {goal.metricTargets.length === 0 && <span className="vp-muted">暂无指标承诺</span>}
      <button
        className="wb-btn wb-btn-secondary wb-btn-sm"
        title="在会话中配置指标"
        onClick={prepare}
      >
        <MessageSquarePlus size={14} aria-hidden="true" />
        配置指标
      </button>
      {metrics.error && <p className="vp-muted">指标未知：{metrics.error}</p>}
    </div>
  )
}
