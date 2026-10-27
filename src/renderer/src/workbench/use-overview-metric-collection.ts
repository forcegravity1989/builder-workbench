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
import { createSnapshotCache, useSnapshotCache } from './snapshot-cache'

const cache = createSnapshotCache(() => ({
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
  /** Re-read the maintenance worktree file while this view stays open. */
  watch?: boolean
}) {
  const { baseScope, baseWorktreeId, identity, granularity, watch = false } = args
  const key = JSON.stringify([identity, baseWorktreeId])
  const entry = useMemo(() => cache(key), [key])
  const snapshot = useSnapshotCache(entry)
  /**
   * initial: first read, short-circuits once loaded.
   * reload: in-place re-read after「更新代码」— persisted readings are re-read
   *   under the new trunk HEAD and only real gaps get collected; old values
   *   stay visible while busy.
   * recollect: the「刷新业务指标」button — forces a real collection run.
   */
  const load = useCallback(
    (mode: 'initial' | 'reload' | 'recollect' = 'initial') => {
      if (!baseScope || !baseWorktreeId || entry.pending) {
        return
      }
      // Returning to the overview re-reads the catalog, including an unsaved
      // file in the metrics maintenance worktree. A new commit reloads
      // readings; a draft-only edit updates the board and leaves readings.
      if (mode === 'initial' && entry.read().loaded) {
        const scope = {
          repoId: baseScope.repoId,
          worktreeId: baseWorktreeId,
          hostId: baseScope.hostId
        }
        const owner = baseScope.runtimeOwnerEnvironmentId
        entry.pending = (async () => {
          let handedOff = false
          try {
            const catalog = await nativeMetricsPort(owner).list(scope)
            const current = entry.read().catalog
            if (catalog.configurationCommit !== current?.configurationCommit) {
              handedOff = true
              entry.pending = null
              load('reload')
            } else if ((catalog.draft ?? null) !== (current?.draft ?? null)) {
              entry.publish({
                ...entry.read(),
                catalog,
                problems: catalog.problems.map(metricProblemText)
              })
            }
          } catch (error) {
            entry.publish({ ...entry.read(), problems: [`指标读取失败：${String(error)}`] })
          } finally {
            if (!handedOff) {
              entry.pending = null
            }
          }
        })()
        return
      }
      const scope = {
        repoId: baseScope.repoId,
        worktreeId: baseWorktreeId,
        hostId: baseScope.hostId
      }
      const owner = baseScope.runtimeOwnerEnvironmentId
      const now = new Date().toISOString()
      entry.publish({ ...entry.read(), busy: true, refreshing: mode === 'recollect' })
      entry.pending = (async () => {
        try {
          const catalog = await nativeMetricsPort(owner).list(scope)
          const problems = catalog.problems.map(metricProblemText)
          const readings: Partial<Record<ZoneGranularity, OverviewReadResult>> = {}
          const oldReadings = entry.read().readings
          const order: ZoneGranularity[] = [granularity, granularity === 'day' ? 'week' : 'day']
          for (const grain of order) {
            const request = { scope, owner, catalog, granularity: grain, now }
            const previous =
              mode === 'recollect' ? oldReadings[grain] : await readAllMetricReadings(request)
            if (mode !== 'recollect') {
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
              onlyMissing: mode !== 'recollect',
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
  useEffect(() => {
    if (!watch || !baseScope || !baseWorktreeId) {
      return
    }
    const scope = {
      repoId: baseScope.repoId,
      worktreeId: baseWorktreeId,
      hostId: baseScope.hostId
    }
    const owner = baseScope.runtimeOwnerEnvironmentId
    const tick = () => {
      if (entry.pending || !entry.read().loaded) {
        return
      }
      void nativeMetricsPort(owner)
        .list(scope)
        .then((catalog) => {
          const current = entry.read().catalog
          if (catalog.configurationCommit !== current?.configurationCommit) {
            load('reload')
            return
          }
          if ((catalog.draft ?? null) !== (current?.draft ?? null)) {
            entry.publish({
              ...entry.read(),
              catalog,
              problems: catalog.problems.map(metricProblemText)
            })
          }
        })
        .catch(() => {
          // The board keeps the last catalog; the next tick tries again.
        })
    }
    const timer = window.setInterval(tick, 2000)
    return () => window.clearInterval(timer)
  }, [watch, baseScope, baseWorktreeId, entry, load])
  const reading = snapshot.readings[granularity]
  return {
    ...snapshot,
    northReading:
      reading?.north ?? snapshot.readings.day?.north ?? snapshot.readings.week?.north ?? null,
    zoneReadings: reading?.map ?? {},
    problems: [...snapshot.problems, ...(reading?.problems ?? [])],
    reloadCatalog: () => load('reload'),
    refreshReadings: () => load('recollect')
  }
}
