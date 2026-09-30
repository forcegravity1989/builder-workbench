import { useCallback, useRef, useState } from 'react'
import type { MetricCatalog } from '../../../shared/workbench/metrics'
import { nativeMetricsPort } from './metrics-port'
import {
  refreshMetricReadings,
  type OverviewAutoCollect,
  type OverviewReadResult
} from './overview-metric-readings'
import type { ZoneGranularity } from './overview-zone-series'
import type { NativeWorkspaceScope } from './version-cycle/native-workspace'

/**
 * Background auto-collect for cache misses: one non-blocking pass, numbers land
 * when the scripts finish. Only 'not-collected' readings trigger it (see
 * hasUncollectedReadings) — a failing collector surfaces as an error reading and
 * must not loop.
 *
 * `collecting` is cleared by the latest pass only (tracked by ref, not by the
 * page's load epoch): a pass superseded by a granularity switch or project change
 * must still clear the flag when no newer pass is running, or the refresh button
 * stays disabled forever; a newer in-flight pass must not be un-lit by an older
 * pass finishing.
 */
export function useOverviewAutoCollect(args: {
  /** Shared generation guard: a stale pass must never overwrite newer readings. */
  loadEpoch: { current: number }
  apply(result: OverviewReadResult, catalog: MetricCatalog): void
}) {
  const { loadEpoch, apply } = args
  const [collecting, setCollecting] = useState(false)
  const latestPass = useRef(0)
  const autoCollect = useCallback<OverviewAutoCollect>(
    async ({ scope, owner, catalog, granularity, epoch }) => {
      latestPass.current = epoch
      setCollecting(true)
      try {
        const result = await refreshMetricReadings({ scope, owner, catalog, granularity })
        if (epoch !== loadEpoch.current) {
          return
        }
        apply(result, catalog)
      } catch {
        // Port-level failure keeps the Unknown readings on screen; honest, no fake
        // numbers, and no retry loop — the next load or manual refresh tries again.
      } finally {
        if (latestPass.current === epoch) {
          setCollecting(false)
        }
      }
    },
    [loadEpoch, apply]
  )
  return { collecting, autoCollect }
}

/**
 * Manual 「刷新业务指标」: force re-collect and block the page while running — the
 * caller renders the blocking overlay from `refreshing`. The overlay is released
 * unconditionally in `finally`; a refresh superseded by a newer load must not
 * leave it stuck.
 */
export function useOverviewManualRefresh(args: {
  baseScope: NativeWorkspaceScope | null
  baseWorktreeId: string | null
  currentGranularity: () => ZoneGranularity
  loadEpoch: { current: number }
  setBusy(busy: boolean): void
  setCatalog(catalog: MetricCatalog | null): void
  setProblems(problems: string[]): void
  apply(result: OverviewReadResult, catalog: MetricCatalog): void
}) {
  const {
    baseScope,
    baseWorktreeId,
    currentGranularity,
    loadEpoch,
    setBusy,
    setCatalog,
    setProblems,
    apply
  } = args
  const [refreshing, setRefreshing] = useState(false)
  const refreshReadings = useCallback(async () => {
    if (!baseScope || !baseWorktreeId) {
      return
    }
    const epoch = ++loadEpoch.current
    setBusy(true)
    setRefreshing(true)
    try {
      const scope = {
        repoId: baseScope.repoId,
        worktreeId: baseWorktreeId,
        hostId: baseScope.hostId
      }
      const nextCatalog = await nativeMetricsPort(baseScope.runtimeOwnerEnvironmentId).list(scope)
      if (epoch !== loadEpoch.current) {
        return
      }
      setCatalog(nextCatalog)
      const result = await refreshMetricReadings({
        scope,
        owner: baseScope.runtimeOwnerEnvironmentId,
        catalog: nextCatalog,
        granularity: currentGranularity()
      })
      if (epoch !== loadEpoch.current) {
        return
      }
      apply(result, nextCatalog)
    } catch (reason) {
      if (epoch === loadEpoch.current) {
        setProblems([`刷新指标失败：${String(reason)}`])
      }
    } finally {
      // Unconditional: a superseded refresh must not leave the blocking overlay stuck.
      setRefreshing(false)
      if (epoch === loadEpoch.current) {
        setBusy(false)
      }
    }
  }, [
    baseScope,
    baseWorktreeId,
    currentGranularity,
    loadEpoch,
    setBusy,
    setCatalog,
    setProblems,
    apply
  ])
  return { refreshing, refreshReadings }
}
