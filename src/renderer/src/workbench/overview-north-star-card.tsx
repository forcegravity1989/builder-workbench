import type { MetricDefinition, MetricReading } from '../../../shared/workbench/metrics'
import type { MetricsSetupEntry } from './version-cycle/metrics-setup'

/**
 * Honest north star status text: not-ready workspace, unknown catalog, missing
 * configuration, unread and failed reads each stay distinct — never a fake green.
 */
function northStarLabel(args: {
  workspaceReady: boolean
  hasCatalog: boolean
  north: MetricDefinition | undefined
  reading: MetricReading | null
}): string {
  const { workspaceReady, hasCatalog, north, reading } = args
  if (!workspaceReady) {
    return '工作区未就绪'
  }
  if (!hasCatalog) {
    return '目录未知'
  }
  if (!north) {
    return '未配置北极星指标'
  }
  if (reading === null) {
    return '未读取'
  }
  return reading.status === 'ready'
    ? `采集于 ${reading.readings[0]?.collectedAt ?? ''}`
    : `未知：${reading.reason.message}`
}

/**
 * North star card: the honest current read plus the two metric actions — the
 * shared「配置指标」pipeline entry and the collector-backed refresh.
 */
export function NorthStarCard({
  north,
  northReading,
  hasCatalog,
  workspaceReady,
  fallbackTitle,
  busy,
  metricsSetup,
  onRefresh
}: {
  north: MetricDefinition | undefined
  northReading: MetricReading | null
  hasCatalog: boolean
  workspaceReady: boolean
  fallbackTitle: string
  busy: boolean
  metricsSetup: MetricsSetupEntry
  onRefresh(): void
}) {
  const value = northReading?.status === 'ready' ? (northReading.readings[0]?.value ?? null) : null
  const label = northStarLabel({ workspaceReady, hasCatalog, north, reading: northReading })
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
