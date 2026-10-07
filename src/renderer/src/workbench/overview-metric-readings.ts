import { nativeMetricsPort } from './metrics-port'
import { currentMetricWeek } from '../../../shared/workbench/metric-windows'
import { zoneChartRange, type ZoneGranularity } from './overview-zone-series'
import type { MetricCatalog, MetricReading } from '../../../shared/workbench/metrics'

export type OverviewReadScope = { repoId: string; worktreeId: string; hostId: string }
export type OverviewReadResult = {
  north: MetricReading | null
  map: Record<string, MetricReading | null>
  problems: string[]
}
export type OverviewAutoCollect = (args: {
  scope: OverviewReadScope
  owner: string | undefined
  catalog: MetricCatalog
  granularity: ZoneGranularity
  epoch: number
}) => void

/**
 * True when any reading is a pure cache miss ('not-collected'). Only misses
 * trigger the background auto-collect — error readings must not loop: a failing
 * collector stays a visible failure instead of re-running on every load.
 */
export function hasUncollectedReadings(result: OverviewReadResult): boolean {
  const missed = (reading: MetricReading | null) =>
    reading !== null && reading.status === 'unknown' && reading.reason.code === 'not-collected'
  return missed(result.north) || Object.values(result.map).some(missed)
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
}) {
  return args.def.role === 'north_star'
    ? currentMetricWeek(args.catalog.timezone)
    : zoneChartRange(args.granularity, args.catalog.timezone)
}

/** Read north star + every zone definition honestly; failures land in problems, never zero. */
export async function readAllMetricReadings(args: {
  scope: OverviewReadScope
  owner: string | undefined
  catalog: MetricCatalog
  granularity?: ZoneGranularity
}): Promise<OverviewReadResult> {
  const { scope, catalog } = args
  const granularity = args.granularity ?? 'week'
  const metrics = nativeMetricsPort(args.owner)
  const problems: string[] = []
  const entries = await Promise.all(
    catalog.definitions.map(async (def) => {
      const reading = await metrics
        .read({
          scope,
          ref: def.ref,
          window: windowFor({ def, catalog, granularity })
        })
        .catch((reason) => {
          problems.push(
            `${def.name} 读数：${reason instanceof Error ? reason.message : String(reason)}`
          )
          return null
        })
      return [def.ref.definitionHash, reading] as const
    })
  )
  const map = Object.fromEntries(entries)
  const north = catalog.definitions.find((item) => item.role === 'north_star')
  return { north: north ? (map[north.ref.definitionHash] ?? null) : null, map, problems }
}

/** Refresh = run the registered collect scripts, then read again — not a cache lookup. */
export async function refreshMetricReadings(args: {
  scope: OverviewReadScope
  owner: string | undefined
  catalog: MetricCatalog
  granularity?: ZoneGranularity
}): Promise<OverviewReadResult> {
  const { scope, catalog } = args
  const granularity = args.granularity ?? 'week'
  const metrics = nativeMetricsPort(args.owner)
  const problems: string[] = []
  await Promise.all(
    catalog.definitions.map((def) =>
      metrics
        .refresh({
          scope,
          ref: def.ref,
          window: windowFor({ def, catalog, granularity })
        })
        .catch((reason) => {
          problems.push(
            `刷新 ${def.name}：${reason instanceof Error ? reason.message : String(reason)}`
          )
        })
    )
  )
  const read = await readAllMetricReadings(args)
  return { ...read, problems: [...problems, ...read.problems] }
}
