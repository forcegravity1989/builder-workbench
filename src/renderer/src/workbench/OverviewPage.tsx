import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { nativeMetricsPort } from './metrics-port'
import { nativeVersionHistoryPort } from './version-history-port'
import { nativeVersionMaterialPort } from './version-material-port'
import type { MetricCatalog, MetricReading } from '../../../shared/workbench/metrics'
import { metricProblemText } from '../../../shared/workbench/metrics'
import type { VersionHistoryCatalog } from '../../../shared/workbench/version-history'
import { useVersionMinutes } from './use-version-minutes'
import { OverviewMetricZones } from './overview-metric-zones'
import { OverviewSdlcZones } from './overview-sdlc-zones'
import { NorthStarCard } from './overview-north-star-card'
import { ProjectCard } from './overview-project-card'
import { MetricProblemsPanel } from './metric-problems-panel'
import { readAllMetricReadings, refreshMetricReadings } from './overview-metric-readings'
import type { OverviewReadResult } from './overview-metric-readings'
import { useOverviewZoneGranularity } from './use-overview-zone-granularity'
import { useMetricsSetup } from './version-cycle/metrics-setup'
import { findCycleWorktree } from './version-cycle/native-cycle-workspace'
import { OverviewVersionMinutes } from './overview-version-minutes'
import { useOverviewViewState } from './overview-view-state'
import './workbench-overview.css'

function catalogProblems(catalog: MetricCatalog | null): string[] {
  return (catalog?.problems ?? []).map(metricProblemText)
}

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
  const [catalog, setCatalog] = useState<MetricCatalog | null>(null)
  const [northReading, setNorthReading] = useState<MetricReading | null>(null)
  const [zoneReadings, setZoneReadings] = useState<Record<string, MetricReading | null>>({})
  const [history, setHistory] = useState<VersionHistoryCatalog | null>(null)
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)
  const identity = baseScope ? nativeWorkspaceScopeKey(baseScope) : (activeRepoId ?? 'none')
  const [view, setView] = useOverviewViewState(identity)
  const [minutesRetry, setMinutesRetry] = useState(0)
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
  const [problems, setProblems] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  /** Generation guard: a stale project's late responses must not overwrite a newer load. */
  const loadEpoch = useRef(0)
  const invalidate = useCallback(() => {
    loadEpoch.current++
  }, [])
  const applyZoneResult = useCallback(
    (result: OverviewReadResult) => {
      setNorthReading(result.north)
      setZoneReadings(result.map)
      setProblems([...catalogProblems(catalog), ...result.problems])
    },
    [catalog]
  )
  const zones = useOverviewZoneGranularity({
    identity,
    catalog,
    baseScope,
    baseWorktreeId,
    loadEpoch,
    setBusy,
    apply: applyZoneResult
  })
  const { currentGranularity, markRead } = zones

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

  const load = useCallback(async () => {
    if (!baseScope || !baseWorktreeId) {
      return
    }
    const scope = {
      repoId: baseScope.repoId,
      worktreeId: baseWorktreeId,
      hostId: baseScope.hostId
    }
    const owner = baseScope.runtimeOwnerEnvironmentId
    const epoch = ++loadEpoch.current
    setBusy(true)
    const problems: string[] = []
    try {
      const metrics = nativeMetricsPort(owner)
      const historyPort = nativeVersionHistoryPort(owner)
      const material = nativeVersionMaterialPort(
        { ...scope, worktreeId: fixedTrees.plan ?? baseWorktreeId, workflow: 'plan' },
        owner
      )
      const [nextCatalog, nextHistory, context] = await Promise.all([
        metrics.list(scope).catch((reason) => {
          problems.push(`指标目录：${reason instanceof Error ? reason.message : String(reason)}`)
          return null
        }),
        historyPort.list({ scope }).catch((reason) => {
          problems.push(`归档记录：${reason instanceof Error ? reason.message : String(reason)}`)
          return null
        }),
        material.context().catch(() => ({ version: null }))
      ])
      if (epoch !== loadEpoch.current) {
        return
      }
      setCatalog(nextCatalog)
      setHistory(nextHistory)
      setCurrentVersion(context.version)
      problems.push(...catalogProblems(nextCatalog))
      if (nextCatalog) {
        const granularity = currentGranularity()
        markRead(granularity)
        const result = await readAllMetricReadings({
          scope,
          owner,
          catalog: nextCatalog,
          granularity
        })
        if (epoch !== loadEpoch.current) {
          return
        }
        setNorthReading(result.north)
        setZoneReadings(result.map)
        problems.push(...result.problems)
      } else if (epoch === loadEpoch.current) {
        setZoneReadings({})
      }
    } finally {
      if (epoch === loadEpoch.current) {
        setBusy(false)
      }
    }
    setProblems(problems)
  }, [baseScope, baseWorktreeId, currentGranularity, markRead, fixedTrees.plan])

  const refreshReadings = useCallback(async () => {
    if (!baseScope || !baseWorktreeId) {
      return
    }
    const epoch = ++loadEpoch.current
    setBusy(true)
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
        scope: { repoId: baseScope.repoId, worktreeId: baseWorktreeId, hostId: baseScope.hostId },
        owner: baseScope.runtimeOwnerEnvironmentId,
        catalog: nextCatalog,
        granularity: currentGranularity()
      })
      if (epoch !== loadEpoch.current) {
        return
      }
      setZoneReadings(result.map)
      setNorthReading(result.north)
      setProblems([...catalogProblems(nextCatalog), ...result.problems])
    } catch (reason) {
      if (epoch === loadEpoch.current) {
        setProblems([`刷新指标失败：${String(reason)}`])
      }
    } finally {
      if (epoch === loadEpoch.current) {
        setBusy(false)
      }
    }
  }, [baseScope, baseWorktreeId, currentGranularity])

  useEffect(() => {
    setCatalog(null)
    setHistory(null)
    setNorthReading(null)
    setZoneReadings({})
    setCurrentVersion(null)
    setProblems([])
    void load()
    return invalidate
  }, [load, invalidate])

  const versions = useMemo(() => {
    const found = new Set<string>()
    for (const record of history?.records ?? []) {
      found.add(record.version)
    }
    if (currentVersion) {
      found.add(currentVersion)
    }
    return [...found]
  }, [history, currentVersion])
  const version =
    view.version && versions.includes(view.version)
      ? view.version
      : (currentVersion ?? versions[0] ?? null)
  const cycles = useMemo(() => {
    const archived = [
      ...new Set(
        (history?.records ?? [])
          .filter((item) => item.version === version)
          .sort((a, b) => b.committedAt.localeCompare(a.committedAt))
          .map((item) => item.cycleId)
      )
    ]
    return version === currentVersion ? ['current', ...archived] : archived
  }, [history, version, currentVersion])
  const cycle = view.cycle && cycles.includes(view.cycle) ? view.cycle : (cycles[0] ?? 'current')

  const minutes = useVersionMinutes(
    {
      baseScope,
      baseWorktreeId,
      planWorktreeId: fixedTrees.plan,
      acceptanceWorktreeId: fixedTrees.acceptance,
      history,
      currentVersion,
      version,
      cycle
    },
    minutesRetry
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
            hasCatalog={catalog !== null}
            workspaceReady={baseScope !== null}
            fallbackTitle={charter?.opportunity?.trim() || '（未配置）'}
          />
        </div>

        <OverviewVersionMinutes
          versions={versions}
          version={version}
          onVersion={(value) => setView({ version: value, cycle: null })}
          cycles={cycles}
          cycle={cycle}
          onCycle={(value) => setView({ cycle: value })}
          minutes={minutes}
          historyProblems={history?.problems ?? []}
          onRetry={() => void load().then(() => setMinutesRetry((value) => value + 1))}
        />
        <OverviewMetricZones
          catalog={catalog}
          readings={zoneReadings}
          busy={busy}
          onRefresh={() => void refreshReadings()}
          granularity={zones.granularity}
          onGranularityChange={zones.setGranularity}
          identity={identity}
          setupBusy={metricsSetup.busy || !baseScope}
          onSetup={() => void metricsSetup.prepareMetrics()}
        />

        <OverviewSdlcZones
          key={identity}
          identity={identity}
          repo={activeRepo}
          baseScope={baseScope}
          baseWorktreeId={baseWorktreeId}
          baseWorktreePath={baseWorktree?.path ?? null}
          timezone={catalog?.timezone}
        />
      </div>
    </div>
  )
}
