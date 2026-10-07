import React, { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { openProjectOnboard } from './project-page-state'
import { CharterPrNotice } from './charter-pr-notice'
import { useCharterPrStatus } from './use-charter-pr-status'
import { readProjectCharter, type ProjectCharter } from './project-charter'
import {
  nativeWorkspaceScope,
  nativeWorkspaceScopeKey,
  type NativeWorkspaceScope
} from './version-cycle/native-workspace'
import { useVersionMinutes } from './use-version-minutes'
import { OverviewMetricZones } from './overview-metric-zones'
import { OverviewSdlcZones } from './overview-sdlc-zones'
import { NorthStarCard } from './overview-north-star-card'
import { ProjectCard } from './overview-project-card'
import { MetricProblemsPanel } from './metric-problems-panel'
import { useOverviewMetricCollection } from './use-overview-metric-collection'
import { useOverviewHistory } from './use-overview-history'
import { useMetricsSetup } from './version-cycle/metrics-setup'
import { findCycleWorktree } from './version-cycle/native-cycle-workspace'
import { OverviewVersionMinutes } from './overview-version-minutes'
import { useOverviewViewState } from './overview-view-state'
import { RefreshCw } from 'lucide-react'
import './workbench-overview.css'
const versionCollator = new Intl.Collator(undefined, { numeric: true })

export function OverviewPage(): React.JSX.Element {
  const repos = useAppStore((s) => s.repos)
  const activeRepoId = useAppStore((s) => s.activeRepoId ?? s.repos[0]?.id ?? null)
  const repoWorktrees = useAppStore((s) =>
    activeRepoId ? s.worktreesByRepo[activeRepoId] : undefined
  )
  const activeRepo = repos.find((r) => r.id === activeRepoId) ?? repos[0]

  /** Metrics/history read from the project's main worktree: the configuration baseline tree. */
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

  const charterKey = JSON.stringify([activeRepo?.id, activeRepo?.path])
  const [charterState, setCharter] = useState<{
    key: string
    value: ProjectCharter | null
  } | null>(null)
  const charter = charterState?.key === charterKey ? charterState.value : null
  const identity = baseScope ? nativeWorkspaceScopeKey(baseScope) : (activeRepoId ?? 'none')
  const [view, setView] = useOverviewViewState(identity)
  const fixedTrees = useMemo(() => {
    if (!baseScope) {
      return { plan: null, acceptance: null, error: null }
    }
    try {
      return {
        plan: findCycleWorktree({ ...baseScope, workflow: 'plan' })?.id ?? null,
        acceptance: findCycleWorktree({ ...baseScope, workflow: 'acceptance' })?.id ?? null,
        error: null
      }
    } catch (error) {
      return { plan: null, acceptance: null, error: String(error) }
    }
  }, [baseScope])
  const dataIdentity = JSON.stringify([
    identity,
    activeRepo?.path,
    activeRepo?.connectionId,
    activeRepo?.worktreeBaseRef,
    activeRepo?.upstream,
    activeRepo?.gitRemoteIdentity,
    baseWorktree?.path
  ])
  const metrics = useOverviewMetricCollection({
    baseScope,
    baseWorktreeId,
    identity: dataIdentity,
    granularity: view.granularity
  })
  const { catalog, northReading, zoneReadings, busy, refreshing, refreshReadings } = metrics
  const historyState = useOverviewHistory({
    baseScope,
    baseWorktreeId,
    planWorktreeId: fixedTrees.plan,
    acceptanceWorktreeId: fixedTrees.acceptance,
    identity: dataIdentity
  })
  const { history, currentVersion } = historyState
  const problems = [...metrics.problems, ...(historyState.problem ? [historyState.problem] : [])]

  useEffect(() => {
    if (!activeRepo?.path) {
      setCharter(null)
      return
    }
    let cancelled = false
    void readProjectCharter(activeRepo.path).then((r) => {
      if (!cancelled) {
        setCharter({ key: charterKey, value: r.charter })
      }
    })
    return () => {
      cancelled = true
    }
  }, [activeRepo?.path, charterKey])

  // 主检出没有名片才查 PR 状态:待合入 / 已合入未更新 / 没查成(spec 规则 2)。
  const { charterStatus, updatingMain, updateMainCheckout } = useCharterPrStatus(
    activeRepo,
    Boolean(charter),
    charterKey,
    (value) => setCharter({ key: charterKey, value })
  )

  const versions = useMemo(() => {
    const found = new Set<string>()
    for (const record of history?.records ?? []) {
      found.add(record.version)
    }
    for (const problem of history?.problems ?? []) {
      found.add(problem.version)
    }
    if (currentVersion) {
      found.add(currentVersion)
    }
    return [...found].sort((a, b) => versionCollator.compare(b, a))
  }, [history, currentVersion])
  const version =
    view.version && versions.includes(view.version)
      ? view.version
      : (currentVersion ?? versions[0] ?? null)
  const minutes = useVersionMinutes(
    {
      baseScope,
      baseWorktreeId,
      planWorktreeId: historyState.planWorktreeId,
      acceptanceWorktreeId: historyState.acceptanceWorktreeId,
      history,
      currentVersion,
      version
    },
    historyState.retry
  )

  const metricsSetup = useMetricsSetup({ baseScope, worktreeId: baseWorktreeId })

  if (!activeRepo) {
    return (
      <div className="wb-ov">
        <header className="page-head">
          <h1>总览</h1>
        </header>
        <div className="content">
          <section className="card" style={{ padding: 24, textAlign: 'center' }}>
            <p style={{ margin: '0 0 12px', fontSize: 14 }}>还没有接入项目。</p>
            <p style={{ margin: '0 0 16px', fontSize: 12.5, opacity: 0.65 }}>
              点左上角项目名打开项目墙，再「+ 接入项目」。
            </p>
            <button
              type="button"
              className="wb-btn wb-btn-primary"
              onClick={() => openProjectOnboard()}
            >
              + 接入项目
            </button>
          </section>
        </div>
      </div>
    )
  }

  const projectName = charter?.name?.trim() || activeRepo.displayName || activeRepo.id
  const north = catalog?.definitions.find((item) => item.role === 'north_star')

  return (
    <div className="wb-ov">
      <header className="page-head">
        <h1>总览</h1>
      </header>

      <div className="content">
        <MetricProblemsPanel
          className="wb-muted"
          problems={fixedTrees.error ? [...problems, fixedTrees.error] : problems}
        />
        {metricsSetup.notice && (
          <p role="alert" className="wb-ov-alert">
            {metricsSetup.notice}
          </p>
        )}
        <div className="row-2">
          <ProjectCard
            projectName={projectName}
            charter={charter}
            remote={activeRepo.gitRemoteIdentity?.canonicalKey ?? null}
            version={version}
            notice={
              !charter ? (
                <CharterPrNotice
                  status={charterStatus}
                  variant="overview"
                  updating={updatingMain}
                  onUpdateMain={() => void updateMainCheckout()}
                />
              ) : undefined
            }
          />

          <NorthStarCard
            north={north}
            northReading={northReading}
            busy={busy}
            hasCatalog={catalog !== null}
            workspaceReady={baseScope !== null}
            fallbackTitle={charter?.opportunity?.trim() || '（未配置）'}
          />
        </div>

        <OverviewVersionMinutes
          versions={versions}
          version={version}
          onVersion={(value) => setView({ version: value })}
          minutes={minutes}
          historyProblems={history?.problems ?? []}
          busy={historyState.busy}
          onRetry={historyState.reload}
        />
        <OverviewMetricZones
          catalog={catalog}
          readings={zoneReadings}
          busy={busy}
          onRefresh={() => void refreshReadings()}
          granularity={view.granularity}
          anchor={metrics.anchor}
          onGranularityChange={(granularity) => setView({ granularity })}
          identity={identity}
          setupBusy={metricsSetup.busy || !baseScope}
          onSetup={() => void metricsSetup.prepareMetrics()}
        />

        <OverviewSdlcZones
          key={identity}
          identity={dataIdentity}
          repo={activeRepo}
          baseScope={baseScope}
          baseWorktreeId={baseWorktreeId}
          baseWorktreePath={baseWorktree?.path ?? null}
          timezone={catalog?.timezone}
          ready={catalog !== null || metrics.loaded}
        />
      </div>
      {refreshing && (
        <div className="wb-ov-refresh-block" role="status" aria-live="polite">
          <div className="wb-ov-refresh-card">
            <RefreshCw size={16} className="wb-ov-refresh-spin" />
            <span>正在重新采集指标读数…</span>
          </div>
        </div>
      )}
    </div>
  )
}
