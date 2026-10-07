import { useCallback, useEffect, useMemo } from 'react'
import { metricProblemText, type MetricCatalog } from '../../../shared/workbench/metrics'
import { nativeMetricsPort } from './metrics-port'
import {
  readAllMetricReadings,
  refreshMetricReadings,
  type OverviewReadResult
} from './overview-metric-readings'
import type { NativeWorkspaceScope } from './version-cycle/native-workspace'
import type { ZoneGranularity } from './overview-zone-series'
import { createOverviewSnapshotCache, useOverviewSnapshot } from './overview-snapshot-cache'

const cache = createOverviewSnapshotCache(() => ({
  catalog: null as MetricCatalog | null,
  readings: {} as Partial<Record<ZoneGranularity, OverviewReadResult>>,
  anchor: new Date().toISOString(),
  loaded: false,
  busy: false,
  refreshing: false,
  problems: [] as string[]
}))

export function useOverviewMetricCollection(args: {
  baseScope: NativeWorkspaceScope | null
  baseWorktreeId: string | null
  identity: string
  granularity: ZoneGranularity
}) {
  const { baseScope, baseWorktreeId, identity, granularity } = args
  const key = JSON.stringify([identity, baseWorktreeId])
  const entry = useMemo(() => cache(key), [key])
  const snapshot = useOverviewSnapshot(entry)
  const load = useCallback(
    (force = false) => {
      if (!baseScope || !baseWorktreeId || entry.pending || (!force && entry.read().loaded)) {
        return
      }
      const scope = {
        repoId: baseScope.repoId,
        worktreeId: baseWorktreeId,
        hostId: baseScope.hostId
      }
      const owner = baseScope.runtimeOwnerEnvironmentId
      const now = new Date().toISOString()
      entry.publish({ ...entry.read(), busy: true, refreshing: force })
      entry.pending = (async () => {
        try {
          const catalog = await nativeMetricsPort(owner).list(scope)
          const problems = catalog.problems.map(metricProblemText)
          const readings: Partial<Record<ZoneGranularity, OverviewReadResult>> = {}
          const oldReadings = entry.read().readings
          const order: ZoneGranularity[] = [granularity, granularity === 'day' ? 'week' : 'day']
          for (const grain of order) {
            const request = { scope, owner, catalog, granularity: grain, now }
            const previous = force ? oldReadings[grain] : await readAllMetricReadings(request)
            if (!force) {
              readings[grain] = previous
              entry.publish({
                ...entry.read(),
                catalog,
                readings: { ...oldReadings, ...readings },
                anchor: now,
                problems
              })
            }
            readings[grain] = await refreshMetricReadings({
              ...request,
              previous,
              onlyMissing: !force,
              sharedNorth: grain === order[1] ? readings[order[0]]?.north : undefined
            })
            entry.publish({
              ...entry.read(),
              catalog,
              readings: { ...oldReadings, ...readings },
              anchor: now,
              problems
            })
          }
        } catch (error) {
          entry.publish({ ...entry.read(), problems: [`指标读取失败：${String(error)}`] })
        } finally {
          entry.pending = null
          entry.publish({ ...entry.read(), loaded: true, busy: false, refreshing: false })
        }
      })()
    },
    [baseScope, baseWorktreeId, entry, granularity]
  )
  useEffect(() => {
    load()
  }, [load])
  const reading = snapshot.readings[granularity]
  return {
    ...snapshot,
    northReading:
      reading?.north ?? snapshot.readings.day?.north ?? snapshot.readings.week?.north ?? null,
    zoneReadings: reading?.map ?? {},
    problems: [...snapshot.problems, ...(reading?.problems ?? [])],
    refreshReadings: () => load(true)
  }
}
