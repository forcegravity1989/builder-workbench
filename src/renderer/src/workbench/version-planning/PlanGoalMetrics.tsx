import { metricRefKey } from '../../../../shared/workbench/metrics'
import type { VersionGoal } from '../../../../shared/workbench/version-material'
import type { usePlanMetrics } from './use-plan-metrics'

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
            {value?.status === 'ready' ? (
              value.readings.map((reading) => (
                <p
                  key={`${reading.collectedAt}:${reading.source}:${JSON.stringify(reading.observation)}`}
                >
                  当前：{String(reading.value)} {reading.unit}
                  <small>
                    采集于 {reading.collectedAt} · {reading.source}
                  </small>
                </p>
              ))
            ) : (
              <p className="vp-muted">
                当前未知 · 数值目标为草案
                {value ? `：${value.reason.message}` : ''}
              </p>
            )}
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
        <select
          aria-label={`为 ${goal.title || '目标'} 选择指标`}
          value=""
          onChange={(event) => {
            const definition = metrics.catalog?.definitions.find(
              (item) => metricRefKey(item.ref) === event.target.value
            )
            if (definition) {
              onChange({
                ...goal,
                metricTargets: [...goal.metricTargets, { ref: definition.ref, target: '' }]
              })
            }
          }}
        >
          <option value="">选择项目指标</option>
          {metrics.catalog?.definitions
            .filter(
              (item) =>
                !goal.metricTargets.some(
                  (target) => metricRefKey(target.ref) === metricRefKey(item.ref)
                )
            )
            .map((item) => (
              <option key={metricRefKey(item.ref)} value={metricRefKey(item.ref)}>
                {item.name}
              </option>
            ))}
        </select>
        <button className="wb-btn wb-btn-ghost wb-btn-sm" onClick={prepare}>
          配置指标
        </button>
      </div>
      {metrics.error && <p className="vp-muted">指标未知：{metrics.error}</p>}
    </details>
  )
}
