import { useCallback, useEffect, useRef } from 'react'
import type { MetricCatalog } from '../../../shared/workbench/metrics'
import { readAllMetricReadings, type OverviewReadResult } from './overview-metric-readings'
import { useOverviewViewState } from './overview-view-state'
import type { ZoneGranularity } from './overview-zone-series'
import type { NativeWorkspaceScope } from './version-cycle/native-workspace'

/**
 * Day/week selection for the overview zone charts. Switching granularity re-reads
 * the zone readings once through the existing read RPC with the new window — an
 * uncollected span honestly stays Unknown until the next refresh runs collectors.
 * The getter/markRead pair lets the page's stable load/refresh callbacks use the
 * current selection without re-creating on every switch.
 */
export function useOverviewZoneGranularity(args: {
  identity: string
  catalog: MetricCatalog | null
  baseScope: NativeWorkspaceScope | null
  baseWorktreeId: string | null
  /** Shared generation guard: a stale response must never overwrite a newer load. */
  loadEpoch: { current: number }
  setBusy(busy: boolean): void
  apply(result: OverviewReadResult): void
}) {
  const { catalog, baseScope, baseWorktreeId, loadEpoch, setBusy, apply } = args
  const [view, setView] = useOverviewViewState(args.identity)
  const granularity = view.granularity
  const setGranularity = useCallback(
    (value: ZoneGranularity) => setView({ granularity: value }),
    [setView]
  )
  const current = useRef(granularity)
  current.current = granularity
  /** Granularity the on-screen zone readings were read with; guards duplicate reloads. */
  const read = useRef<ZoneGranularity | null>(null)
  const currentGranularity = useCallback(() => current.current, [])
  const markRead = useCallback((value: ZoneGranularity) => {
    read.current = value
  }, [])
  const reload = useCallback(async () => {
    if (!catalog || !baseScope || !baseWorktreeId) {
      return
    }
    const epoch = ++loadEpoch.current
    setBusy(true)
    try {
      const result = await readAllMetricReadings({
        scope: { repoId: baseScope.repoId, worktreeId: baseWorktreeId, hostId: baseScope.hostId },
        owner: baseScope.runtimeOwnerEnvironmentId,
        catalog,
        granularity: current.current
      })
      if (epoch !== loadEpoch.current) {
        return
      }
      apply(result)
    } finally {
      if (epoch === loadEpoch.current) {
        setBusy(false)
      }
    }
  }, [catalog, baseScope, baseWorktreeId, loadEpoch, setBusy, apply])
  useEffect(() => {
    if (!catalog || read.current === granularity) {
      return
    }
    read.current = granularity
    void reload()
  }, [catalog, granularity, reload])
  return { granularity, setGranularity, currentGranularity, markRead }
}
