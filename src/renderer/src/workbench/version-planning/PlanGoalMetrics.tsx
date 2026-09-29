import { ChartNoAxesCombined, RefreshCw, MessageSquarePlus } from 'lucide-react'
import { metricRefKey } from '../../../../shared/workbench/metrics'
import type { VersionGoal } from '../../../../shared/workbench/version-material'
import type { usePlanMetrics } from './use-plan-metrics'
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
  const definitions = metrics.catalog?.definitions ?? []
  const selected = new Set(goal.metricTargets.map((item) => item.ref.name))
  const available = definitions.filter((item) => !selected.has(item.name))
  const changeMetric = (index: number, key: string) => {
    if (!key) {
      onChange({ ...goal, metricTargets: goal.metricTargets.filter((_, i) => i !== index) })
      return
    }
    const definition = definitions.find((item) => metricRefKey(item.ref) === key)
    if (definition) {
      // A different definition must not inherit the old target or adopted baseline.
      onChange({
        ...goal,
        metricTargets: goal.metricTargets.map((item, i) =>
          i === index ? { ref: definition.ref, target: '' } : item
        )
      })
    }
  }
  return (
    <div className="vp-metrics">
      {goal.metricTargets.map((target, index) => {
        const key = metricRefKey(target.ref)
        const definition = definitions.find((item) => item.name === target.ref.name)
        const value = metrics.values[key]
        const reading =
          value?.status === 'ready' && value.readings.length === 1 ? value.readings[0] : null
        return (
          <div className="vp-metric" key={key}>
            <div className="vp-metric-row">
              <label className="vp-metric-name">
                <ChartNoAxesCombined size={14} />
                <select
                  aria-label={`${goal.title || '目标'} 指标 ${index + 1}`}
                  value={key}
                  onChange={(event) => changeMetric(index, event.target.value)}
                >
                  <option value="">移除指标承诺</option>
                  <option value={key}>
                    {target.ref.name}
                    {!definition ? '（目录中暂无）' : ''}
                  </option>
                  {available.map((item) => (
                    <option value={metricRefKey(item.ref)} key={metricRefKey(item.ref)}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="vp-metric-value">
                <span>当前</span>
                <strong title={reading ? reading.collectedAt : '此来源和窗口尚无可信读数'}>
                  {reading ? `${reading.value}${reading.unit}` : '—'}
                </strong>
              </div>
              <label className="vp-metric-target">
                <span>{reading ? '目标' : '目标草案'}</span>
                <input
                  aria-label={`${target.ref.name} 本版目标`}
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
              <button className="wb-btn wb-btn-sm" onClick={() => void metrics.refresh(target.ref)}>
                <RefreshCw size={14} />
                采集
              </button>
            </div>
            <details className="vp-metric-evidence">
              <summary>定义与采集依据{target.baseline ? ' · 已采用计划基线' : ''}</summary>
              {definition && (
                <p>
                  {definition.def} · 项目长期目标：{definition.target || '未定义'}
                </p>
              )}
              <MetricEvidenceView result={value} saved={target.baseline ? [target.baseline] : []} />
              {target.baseline && (
                <p>
                  计划基线：{target.baseline.value}
                  {target.baseline.unit}
                </p>
              )}
              {reading && (
                <button
                  className="wb-btn wb-btn-sm"
                  onClick={() =>
                    onChange({
                      ...goal,
                      metricTargets: goal.metricTargets.map((item, i) =>
                        i === index ? { ...item, ref: reading.ref, baseline: reading } : item
                      )
                    })
                  }
                >
                  采用为计划基线
                </button>
              )}
            </details>
          </div>
        )
      })}
      <select
        className="vp-metric-add"
        aria-label={`${goal.title || '目标'} 添加指标承诺（可选）`}
        value=""
        onChange={(event) => {
          const definition = available.find((item) => metricRefKey(item.ref) === event.target.value)
          if (definition) {
            onChange({
              ...goal,
              metricTargets: [...goal.metricTargets, { ref: definition.ref, target: '' }]
            })
          }
        }}
      >
        <option value="">添加指标承诺（可选）</option>
        {available.map((item) => (
          <option value={metricRefKey(item.ref)} key={metricRefKey(item.ref)}>
            {item.name}
          </option>
        ))}
      </select>
      <button
        className="wb-btn wb-btn-secondary wb-btn-sm"
        title="刷新指标目录"
        aria-label="刷新指标目录"
        onClick={() => void metrics.reloadCatalog()}
      >
        <RefreshCw size={14} />
      </button>
      <button
        className="wb-btn wb-btn-secondary wb-btn-sm"
        title="新建会话，配置指标"
        onClick={prepare}
      >
        <MessageSquarePlus size={14} aria-hidden="true" />
        配置指标
      </button>
      {metrics.error && <p className="vp-muted">指标未知：{metrics.error}</p>}
    </div>
  )
}
