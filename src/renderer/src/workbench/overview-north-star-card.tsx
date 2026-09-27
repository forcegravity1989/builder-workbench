import type { MetricDefinition } from '../../../shared/workbench/metrics'
import type { MetricsSetupEntry } from './version-cycle/metrics-setup'

/**
 * North star card: the honest current read plus the two metric actions — the
 * shared「配置指标」pipeline entry and the collector-backed refresh.
 */
export function NorthStarCard({
  north,
  fallbackTitle,
  value,
  label,
  busy,
  metricsSetup,
  onRefresh
}: {
  north: MetricDefinition | undefined
  fallbackTitle: string
  value: string | number | null
  label: string
  busy: boolean
  metricsSetup: MetricsSetupEntry
  onRefresh(): void
}) {
  return (
    <section className="card">
      <div className="row-between">
        <span className="card-kicker">北极星指标</span>
        <span className="row-start">
          <button
            type="button"
            className="wb-btn wb-btn-ghost wb-btn-sm"
            disabled={metricsSetup.busy}
            title="在独立指标维护树打开原生项目会话，确定口径并登记采集脚本"
            onClick={() => void metricsSetup.prepareMetrics()}
          >
            配置指标
          </button>
          <button
            type="button"
            className="wb-btn wb-btn-ghost wb-btn-sm"
            disabled={busy}
            title="执行登记采集脚本后重读全部指标（含滞后/引领）"
            onClick={onRefresh}
          >
            刷新读数
          </button>
        </span>
      </div>
      <span className="card-title">{north?.name ?? fallbackTitle}</span>
      <div className="row-start">
        <h2 className="metric-value">{value === null ? '—' : `${value}${north?.unit ?? ''}`}</h2>
        {north?.target && <span className="metric-target">目标 {north.target}</span>}
        <span className="wb-tag wb-tag-neutral">{label}</span>
      </div>
    </section>
  )
}
