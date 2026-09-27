import type {
  MetricCatalog,
  MetricDefinition,
  MetricReading
} from '../../../shared/workbench/metrics'

export type MetricZoneGroup = { feature: string; defs: MetricDefinition[] }

/** Lagging/leading definitions grouped by their feature tab; empty feature = main tab. */
export function groupZoneDefs(catalog: MetricCatalog | null): MetricZoneGroup[] {
  const defs = (catalog?.definitions ?? []).filter((item) => item.role !== 'north_star')
  const groups = new Map<string, MetricDefinition[]>()
  for (const def of defs) {
    const key = def.feature.trim() || '主要页签'
    const bucket = groups.get(key)
    if (bucket) {
      bucket.push(def)
    } else {
      groups.set(key, [def])
    }
  }
  return [...groups.entries()].map(([feature, grouped]) => ({ feature, defs: grouped }))
}

function readingLabel(reading: MetricReading | null): string {
  if (reading === null) {
    return '未读取'
  }
  return reading.status === 'ready'
    ? `采集于 ${reading.readings[0]?.collectedAt ?? ''}`
    : `未知：${reading.reason.message}`
}

/**
 * Overview lagging/leading zones (hi-fi target block): same honest read path as the
 * north star, grouped by feature tab; failures stay Unknown, never zero.
 */
export function OverviewMetricZones({
  catalog,
  readings
}: {
  catalog: MetricCatalog
  readings: Record<string, MetricReading | null>
}) {
  const groups = groupZoneDefs(catalog)
  if (groups.length === 0) {
    return null
  }
  return (
    <section className="card" id="metrics-zones">
      <div className="card-head">
        <h6>滞后与引领指标</h6>
        <span className="wb-tag wb-tag-neutral">按特性页签分组 · 读数如实</span>
      </div>
      {groups.map((group) => (
        <div key={group.feature} className="wb-mz-group">
          <span className="card-kicker">{group.feature}</span>
          {group.defs.map((def) => {
            const reading = readings[def.ref.definitionHash] ?? null
            const value = reading?.status === 'ready' ? (reading.readings[0]?.value ?? null) : null
            return (
              <div key={def.ref.definitionHash} className="wb-mz-row">
                <span
                  className={`wb-tag ${def.role === 'leading' ? 'wb-tag-outline' : 'wb-tag-neutral'}`}
                >
                  {def.role === 'leading' ? `引领${def.leads ? `→${def.leads}` : ''}` : '滞后'}
                </span>
                <span className="wb-mz-name">{def.name}</span>
                {def.target ? <span className="metric-target">目标 {def.target}</span> : null}
                <span className="wb-mono">{value === null ? '—' : `${value}${def.unit}`}</span>
                <span className="wb-tag wb-tag-neutral">{readingLabel(reading)}</span>
              </div>
            )
          })}
        </div>
      ))}
    </section>
  )
}
