import type { MetricDefinition, MetricReading } from '../../../shared/workbench/metrics'

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
    ? `采集于 ${reading.readings.at(-1)?.collectedAt ?? ''}`
    : `未知：${reading.reason.message}`
}

export function NorthStarCard({
  north,
  northReading,
  hasCatalog,
  workspaceReady,
  fallbackTitle
}: {
  north: MetricDefinition | undefined
  northReading: MetricReading | null
  hasCatalog: boolean
  workspaceReady: boolean
  fallbackTitle: string
}) {
  const value =
    northReading?.status === 'ready' ? (northReading.readings.at(-1)?.value ?? null) : null
  const label = northStarLabel({ workspaceReady, hasCatalog, north, reading: northReading })
  return (
    <section className="card">
      <div className="row-between">
        <span className="card-kicker">北极星指标</span>
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
