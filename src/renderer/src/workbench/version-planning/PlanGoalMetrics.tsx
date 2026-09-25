import { metricRefKey } from '../../../../shared/workbench/metrics'
import type { VersionGoal } from '../../../../shared/workbench/version-material'
import type { usePlanMetrics } from './use-plan-metrics'
import { MetricSelector } from '../metrics/MetricSelector'
import { MetricEvidenceView } from '../metrics/MetricEvidenceView'

export function PlanGoalMetrics({
  goal,
  onChange,
  metrics,
  prepare
}: {
  goal: VersionGoal
  onChange(goal: VersionGoal): void
  metrics: ReturnType<typeof usePlanMetrics>
  prepare(): void
}) {
  return (
    <details className="vp-metrics" open={goal.metricTargets.length > 0 ? true : undefined}>
      <summary>
        指标 {goal.metricTargets.length > 0 ? `· ${goal.metricTargets.length}` : '（可选）'}
      </summary>
      {goal.metricTargets.map((target, index) => {
        const key = metricRefKey(target.ref)
        const definition = metrics.catalog?.definitions.find(
          (item) => metricRefKey(item.ref) === key
        )
        const value = metrics.values[key]
        return (
          <div className="vp-metric" key={key}>
            <div>
              <strong>{target.ref.name}</strong>
              <span className="vp-muted"> 项目长期目标：{definition?.target || '未定义'}</span>
              <button
                className="wb-btn wb-btn-ghost wb-btn-sm"
                onClick={() =>
                  onChange({
                    ...goal,
                    metricTargets: goal.metricTargets.filter((_, i) => i !== index)
                  })
                }
              >
                移除
              </button>
            </div>
            <MetricEvidenceView result={value} />
            {value?.status !== 'ready' && <p className="vp-muted">当前未知 · 数值目标为草案</p>}
            <label>
              本版目标
              <input
                value={target.target}
                onChange={(event) =>
                  onChange({
                    ...goal,
                    metricTargets: goal.metricTargets.map((item, i) =>
                      i === index ? { ...item, target: event.target.value } : item
                    )
                  })
                }
              />
            </label>
            <button
              className="wb-btn wb-btn-ghost wb-btn-sm"
              disabled={!metrics.catalog}
              onClick={() => void metrics.refresh(target.ref)}
            >
              刷新读数
            </button>
          </div>
        )
      })}
      <div className="vp-inline">
        <MetricSelector
          label={`为 ${goal.title || '目标'} 选择指标`}
          definitions={metrics.catalog?.definitions ?? []}
          selected={goal.metricTargets.map((item) => item.ref)}
          onSelect={(definition) =>
            onChange({
              ...goal,
              metricTargets: [...goal.metricTargets, { ref: definition.ref, target: '' }]
            })
          }
        />
        <button className="wb-btn wb-btn-ghost wb-btn-sm" onClick={prepare}>
          配置指标
        </button>
      </div>
      {metrics.catalog?.definitions.length === 0 && (
        <p className="vp-muted">项目尚未配置业务指标，可先配置，也可继续讨论目标。</p>
      )}
      {metrics.error && <p className="vp-muted">指标未知：{metrics.error}</p>}
    </details>
  )
}
