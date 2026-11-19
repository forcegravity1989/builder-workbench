import { nativeMetricsPort } from './metrics-port'
import { currentMetricWeek } from '../../../shared/monica/metric-windows'
import { zoneChartRange, type ZoneGranularity } from './overview-zone-series'
import type { MetricCatalog, MetricReading } from '../../../shared/monica/metrics'

export type OverviewReadScope = { repoId: string; worktreeId: string; hostId: string }
export type OverviewReadResult = {
  north: MetricReading | null
  map: Record<string, MetricReading | null>
  problems: string[]
}
type ReportReading = (key: string, reading: MetricReading | null, problem?: string) => void

function needsCollection(reading: MetricReading | null | undefined): boolean {
  return reading?.status === 'unknown' && reading.reason.code === 'not-collected'
}

/**
 * North star keeps its single-week current window; zone definitions are read over
 * the chart span for the selected granularity through the same read RPC — the
 * window is a protocol parameter, not a second read path.
 */
function windowFor(args: {
  def: MetricCatalog['definitions'][number]
  catalog: MetricCatalog
  granularity: ZoneGranularity
  now?: string
}) {
  return args.def.role === 'north_star'
    ? currentMetricWeek(args.catalog.timezone, args.now)
    : zoneChartRange(args.granularity, args.catalog.timezone, args.now)
}

/** Read north star + every zone definition honestly; failures land in problems, never zero. */
export async function readAllMetricReadings(args: {
  scope: OverviewReadScope
  owner: string | undefined
  catalog: MetricCatalog
  granularity?: ZoneGranularity
  now?: string
  onReading?: ReportReading
}): Promise<OverviewReadResult> {
  const { scope, catalog } = args
  const granularity = args.granularity ?? 'week'
  const metrics = nativeMetricsPort(args.owner)
  const problems: string[] = []
  const entries = await Promise.all(
    catalog.definitions.map(async (def) => {
      let problem: string | undefined
      const reading = await metrics
        .read({
          scope,
          ref: def.ref,
          window: windowFor({ def, catalog, granularity, now: args.now })
        })
        .catch((reason) => {
          problem = `${def.name} 读数：${reason instanceof Error ? reason.message : String(reason)}`
          problems.push(problem)
          return null
        })
      const key = def.ref.definitionHash
      if (!needsCollection(reading)) {
        args.onReading?.(key, reading, problem)
      }
      return [key, reading] as const
    })
  )
  const map = Object.fromEntries(entries)
  const north = catalog.definitions.find((item) => item.role === 'north_star')
  return { north: north ? (map[north.ref.definitionHash] ?? null) : null, map, problems }
}

/** Consume refresh results without repeating source preparation for a second read. */
export async function refreshMetricReadings(args: {
  scope: OverviewReadScope
  owner: string | undefined
  catalog: MetricCatalog
  granularity?: ZoneGranularity
  now?: string
  previous?: OverviewReadResult
  onlyMissing?: boolean
  sharedNorth?: MetricReading | null
  onReading?: ReportReading
}): Promise<OverviewReadResult> {
  const { scope, catalog } = args
  const granularity = args.granularity ?? 'week'
  const metrics = nativeMetricsPort(args.owner)
  const map: OverviewReadResult['map'] = {}
  // Each script owns an isolated checkout; serialize to bound disk and memory pressure.
  for (const def of catalog.definitions) {
    const key = def.ref.definitionHash
    const previous = args.previous?.map[key]
    if (def.role === 'north_star' && args.sharedNorth !== undefined) {
      map[key] = args.sharedNorth
      continue
    }
    if (args.onlyMissing && !needsCollection(previous)) {
      map[key] = previous ?? null
      continue
    }
    try {
      const reading = await metrics.refresh({
        scope,
        ref: def.ref,
        window: windowFor({ def, catalog, granularity, now: args.now })
      })
      map[key] =
        reading.status === 'ready'
          ? reading
          : {
              ...reading,
              previous:
                reading.previous ?? (previous?.status === 'ready' ? previous : previous?.previous)
            }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      map[key] = {
        status: 'error',
        reason: { code: 'collection-failed', message },
        previous: previous?.status === 'ready' ? previous : previous?.previous
      }
    }
    args.onReading?.(key, map[key])
  }
  const north = catalog.definitions.find((item) => item.role === 'north_star')
  return {
    north: north ? (map[north.ref.definitionHash] ?? null) : null,
    map,
    problems: args.onlyMissing ? (args.previous?.problems ?? []) : []
  }
}
