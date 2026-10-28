import { useMemo, type JSX } from 'react'
import { useAppStore } from '@/store'
import { compareMaterialVersions } from '../../../shared/workbench/version-catalog'
import { OverviewScoreboard, SCOREBOARD_GRANULARITY } from './overview-scoreboard'
import { useOverviewHistory } from './use-overview-history'
import { useOverviewMetricCollection } from './use-overview-metric-collection'
import { useOverviewViewState } from './overview-view-state'
import { useVersionMinutes } from './use-version-minutes'
import { findCycleWorktree } from './version-cycle/native-cycle-workspace'
import {
  nativeWorkspaceScope,
  nativeWorkspaceScopeKey,
  type NativeWorkspaceScope
} from './version-cycle/native-workspace'
import { useMetricsSetup } from './version-cycle/metrics-setup'
import './workbench-overview.css'

/**
 * The same scoreboard as 总览, mounted beside the metrics maintenance session
 * so a save in that worktree shows up without leaving the workspace.
 */
export function MetricsWorkspaceBoard(): JSX.Element {
  const activeRepoId = useAppStore((state) => state.activeRepoId ?? state.repos[0]?.id ?? null)
  const repoWorktrees = useAppStore((state) =>
    activeRepoId ? state.worktreesByRepo[activeRepoId] : undefined
  )
  const activeRepo = useAppStore(
    (state) => state.repos.find((repo) => repo.id === activeRepoId) ?? state.repos[0]
  )
  const baseScope = useMemo<NativeWorkspaceScope | null>(() => {
    if (!activeRepoId || !repoWorktrees?.length) {
      return null
    }
    const home = repoWorktrees.find((item) => item.isMainWorktree) ?? repoWorktrees[0]
    try {
      return nativeWorkspaceScope(home)
    } catch {
      return null
    }
  }, [activeRepoId, repoWorktrees])
  const baseWorktree = useMemo(() => {
    if (!baseScope || !repoWorktrees?.length) {
      return null
    }
    return repoWorktrees.find((item) => item.isMainWorktree) ?? repoWorktrees[0] ?? null
  }, [baseScope, repoWorktrees])
  const baseWorktreeId = baseWorktree?.id ?? null
  const identity = baseScope ? nativeWorkspaceScopeKey(baseScope) : (activeRepoId ?? 'none')
  const dataIdentity = JSON.stringify([
    identity,
    activeRepo?.path,
    activeRepo?.connectionId,
    activeRepo?.worktreeBaseRef,
    activeRepo?.upstream,
    activeRepo?.gitRemoteIdentity,
    baseWorktree?.path
  ])
  const fixedTrees = useMemo(() => {
    if (!baseScope) {
      return { plan: null, acceptance: null }
    }
    try {
      return {
        plan: findCycleWorktree({ ...baseScope, workflow: 'plan' })?.id ?? null,
        acceptance: findCycleWorktree({ ...baseScope, workflow: 'acceptance' })?.id ?? null
      }
    } catch {
      return { plan: null, acceptance: null }
    }
  }, [baseScope])
  const metrics = useOverviewMetricCollection({
    baseScope,
    baseWorktreeId,
    identity: dataIdentity,
    granularity: SCOREBOARD_GRANULARITY,
    watch: true
  })
  const historyState = useOverviewHistory({
    baseScope,
    baseWorktreeId,
    planWorktreeId: fixedTrees.plan,
    acceptanceWorktreeId: fixedTrees.acceptance,
    identity: dataIdentity
  })
  const [view] = useOverviewViewState(identity)
  const versions = useMemo(() => {
    const found = new Set<string>()
    for (const record of historyState.history?.records ?? []) {
      found.add(record.version)
    }
    for (const problem of historyState.history?.problems ?? []) {
      found.add(problem.version)
    }
    if (historyState.currentVersion) {
      found.add(historyState.currentVersion)
    }
    return [...found].sort((left, right) => compareMaterialVersions(right, left))
  }, [historyState.history, historyState.currentVersion])
  const version =
    view.version && versions.includes(view.version)
      ? view.version
      : (historyState.currentVersion ?? versions[0] ?? null)
  const minutes = useVersionMinutes(
    {
      baseScope,
      baseWorktreeId,
      planWorktreeId: historyState.planWorktreeId,
      acceptanceWorktreeId: historyState.acceptanceWorktreeId,
      history: historyState.history,
      currentVersion: historyState.currentVersion,
      version
    },
    historyState.retry
  )
  const metricsSetup = useMetricsSetup({ baseScope, worktreeId: baseWorktreeId })
  return (
    <section className="wb-ov wb-metrics-preview vc-board-col" aria-label="配置记分牌">
      <div className="content">
        <OverviewScoreboard
          catalog={metrics.catalog}
          readings={metrics.zoneReadings}
          busy={metrics.busy}
          onRefresh={() => void metrics.refreshReadings()}
          anchor={metrics.anchor}
          identity={identity}
          plan={minutes?.planDocument ?? null}
          version={version}
          setupBusy={metricsSetup.busy || !baseScope}
          onSetup={() => void metricsSetup.prepareMetrics()}
          worktreeId={baseWorktreeId}
        />
      </div>
    </section>
  )
}
