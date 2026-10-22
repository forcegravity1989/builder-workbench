import { ChartNoAxesCombined, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { metricRefKey } from '../../../../shared/workbench/metrics'
import type { VersionGoal } from '../../../../shared/workbench/version-material'
import { MetricEvidenceView } from '../metrics/MetricEvidenceView'
import { BoardIconButton } from '../board-ui'
import type { usePlanMetrics } from './use-plan-metrics'

/**
 * G3「指标承诺」block: catalog-selected commitments, one row each, current
 * reading (— until collected, never an old reading as this period's value),
 * target marked 目标草案 until a reading exists, and 采集 through the same
 * capability the overview uses. Behavior chain unchanged from the previous
 * PlanGoalMetrics; copy and layout follow the approved production list. The
 * 配置指标 entry moved to the section title.
 */
export function PlanGoalMetrics({
  goal,
  onChange,
  metrics,
  blockProps,
  headingExtra
}: {
  goal: VersionGoal
  onChange(goal: VersionGoal): void
  metrics: ReturnType<typeof usePlanMetrics>
  blockProps: Record<string, string>
  headingExtra?: ReactNode
}) {
  const definitions = metrics.catalog?.definitions ?? []
  const selected = new Set(goal.metricTargets.map((item) => item.ref.name))
  const available = definitions.filter((item) => !selected.has(item.name))

  const changeMetric = (index: number, key: string) => {
    if (!key) {
      onChange({ ...goal, metricTargets: goal.metricTargets.filter((_, i) => i !== index) })
      return
    }
    const definition = available.find((item) => metricRefKey(item.ref) === key)
    if (definition) {
      onChange({
        ...goal,
        metricTargets: goal.metricTargets.map((item, i) =>
          i === index ? { ref: definition.ref, target: '' } : item
        )
      })
    }
  }

  return (
    <div className="g3-metric-block" {...blockProps}>
      <h3>指标承诺{headingExtra}</h3>
      {goal.metricTargets.map((target, index) => {
        const key = metricRefKey(target.ref)
        const definition = definitions.find((item) => metricRefKey(item.ref) === key)
        const definitionUpdated =
          !definition && definitions.some((item) => item.name === target.ref.name)
        const value = metrics.values[key]
        const reading =
          value?.status === 'ready' && value.readings.length === 1 ? value.readings[0] : null
        return (
          <div className="g3-metric-entry" key={key}>
            <div className="g3-metric-row">
              <label className="g3-metric-select">
                <ChartNoAxesCombined size={14} aria-hidden="true" />
                <select
                  aria-label={`${goal.title || '目标'} 指标 ${index + 1}`}
                  value={key}
                  onChange={(event) => changeMetric(index, event.target.value)}
                >
                  <option value="">移除指标承诺</option>
                  <option value={key}>
                    {target.ref.name}
                    {definitionUpdated
                      ? '（定义已更新，保留原承诺）'
                      : !definition
                        ? '（目录中暂无）'
                        : ''}
                  </option>
                  {available.map((item) => (
                    <option value={metricRefKey(item.ref)} key={metricRefKey(item.ref)}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <span className="g3-metric-current">
                当前{' '}
                <strong title={reading ? reading.collectedAt : '本期尚未采集'}>
                  {reading ? `${reading.value}${reading.unit}` : '—'}
                </strong>
              </span>
              <label className="g3-metric-target">
                {reading ? '目标' : '目标草案'}
                <input
                  aria-label={`${target.ref.name} 本版目标值`}
                  value={target.target}
                  placeholder="本版目标值"
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
                type="button"
                className="g3-metric-collect"
                title="读取主干基线的当前读数（与总览同一采集能力）"
                aria-label={`采集 ${target.ref.name} 当前读数`}
                onClick={() => void metrics.refresh(target.ref)}
              >
                <RefreshCw size={13} aria-hidden="true" /> 采集
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
                  type="button"
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
      <div className="g3-metric-add-row">
        <select
          className="g3-metric-add"
          aria-label={`${goal.title || '目标'} 添加指标承诺（可选）`}
          value=""
          onChange={(event) => {
            const definition = available.find(
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
          <option value="">添加指标承诺（可选）</option>
          {available.map((item) => (
            <option value={metricRefKey(item.ref)} key={metricRefKey(item.ref)}>
              {item.name}
            </option>
          ))}
        </select>
        <BoardIconButton label="刷新指标目录" onClick={() => void metrics.reloadCatalog()}>
          <RefreshCw size={14} aria-hidden="true" />
        </BoardIconButton>
      </div>
      {metrics.error && <p className="g3-muted">指标未知：{metrics.error}</p>}
    </div>
  )
}
