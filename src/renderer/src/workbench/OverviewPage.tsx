import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { openProjectOnboard } from './project-onboard-state'
import { readProjectCharter, type ProjectCharter } from './project-charter'
import { nativeWorkspaceScope, type NativeWorkspaceScope } from './version-cycle/native-workspace'
import { nativeMetricsPort } from './metrics-port'
import { nativeVersionHistoryPort } from './version-history-port'
import { nativeVersionMaterialPort } from './version-material-port'
import { metricWindowForDefinition } from '../../../shared/workbench/metric-windows'
import type { MetricCatalog, MetricReading } from '../../../shared/workbench/metrics'
import type { VersionHistoryCatalog } from '../../../shared/workbench/version-history'
import { taskDistribution, useVersionMinutes } from './use-version-minutes'
import './workbench-overview.css'

function charterRows(
  projectName: string,
  c: ProjectCharter | null
): { k: string; v: string; mono?: boolean }[] {
  return [
    { k: '想做什么', v: c?.brief?.trim() || '(还没填)' },
    { k: '对标', v: c?.benchmark?.trim() || '(还没填)', mono: true },
    { k: '目标方向', v: c?.opportunity?.trim() || '(还没填)' },
    { k: '项目群', v: '（未配置）' },
    { k: '项目名', v: c?.name?.trim() || projectName, mono: true }
  ]
}

/** Overview reads real metrics and real archive records; no data stays Unknown, never demo. */
export function OverviewPage(): React.JSX.Element {
  const openArtifactsPage = useAppStore((s) => s.openArtifactsPage)
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
  const baseWorktreeId = useMemo(() => {
    if (!baseScope || !repoWorktrees?.length) {
      return null
    }
    const home = repoWorktrees.find((item) => item.isMainWorktree) ?? repoWorktrees[0]
    return home.id
  }, [baseScope, repoWorktrees])

  const [charter, setCharter] = useState<ProjectCharter | null>(null)
  const [catalog, setCatalog] = useState<MetricCatalog | null>(null)
  const [northReading, setNorthReading] = useState<MetricReading | null>(null)
  const [history, setHistory] = useState<VersionHistoryCatalog | null>(null)
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!activeRepo?.path) {
      setCharter(null)
      return
    }
    let cancelled = false
    void readProjectCharter(activeRepo.path).then((r) => {
      if (!cancelled) {
        setCharter(r.charter)
      }
    })
    return () => {
      cancelled = true
    }
  }, [activeRepo?.path])

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
    setBusy(true)
    const problems: string[] = []
    try {
      const metrics = nativeMetricsPort(owner)
      const historyPort = nativeVersionHistoryPort(owner)
      const material = nativeVersionMaterialPort({ ...scope, workflow: 'plan' }, owner)
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
      setCatalog(nextCatalog)
      setHistory(nextHistory)
      setCurrentVersion(context.version)
      if (nextCatalog) {
        const north = nextCatalog.definitions.find((item) => item.role === 'north_star')
        if (north) {
          const reading = await metrics
            .read({
              scope,
              ref: north.ref,
              window: metricWindowForDefinition(north, nextCatalog.timezone)
            })
            .catch((reason) => {
              problems.push(
                `北极星读数：${reason instanceof Error ? reason.message : String(reason)}`
              )
              return null
            })
          setNorthReading(reading)
        } else {
          setNorthReading(null)
        }
      }
    } finally {
      setBusy(false)
    }
    setNotice(problems.length ? problems.join('；') : null)
  }, [baseScope, baseWorktreeId])

  useEffect(() => {
    setCatalog(null)
    setHistory(null)
    setNorthReading(null)
    setSelectedVersion(null)
    void load()
  }, [load])

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
  const version = selectedVersion ?? currentVersion ?? versions[0] ?? null

  const minutes = useVersionMinutes({
    baseScope,
    baseWorktreeId,
    history,
    currentVersion,
    version
  })

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
  const rows = charterRows(projectName, charter)
  const north = catalog?.definitions.find((item) => item.role === 'north_star')
  const northValue =
    northReading?.status === 'ready' ? (northReading.readings[0]?.value ?? null) : null
  const northLabel = !baseScope
    ? '工作区未就绪'
    : !catalog
      ? '目录未知'
      : !north
        ? '未配置北极星指标'
        : northReading === null
          ? '未读取'
          : northReading.status === 'ready'
            ? `采集于 ${northReading.readings[0]?.collectedAt ?? ''}`
            : `未知：${northReading.reason.message}`
  const distribution = minutes?.acceptance ? taskDistribution(minutes.acceptance.document) : []

  return (
    <div className="wb-ov">
      <header className="page-head">
        <h1>总览</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="wb-btn wb-btn-secondary wb-btn-sm"
            disabled={busy}
            onClick={() => void load()}
          >
            刷新
          </button>
          <button
            type="button"
            className="wb-btn wb-btn-primary wb-btn-sm"
            onClick={() => openArtifactsPage()}
          >
            去计划屏
          </button>
        </div>
      </header>

      <div className="content">
        {notice && (
          <p role="status" className="wb-muted">
            {notice}
          </p>
        )}
        <div className="row-2">
          <section className="card" id="project-card">
            <div className="row-between">
              <div className="row-start">
                <span className="card-title">{projectName}</span>
                <span className="status" title="健康信号只从北极星读数推导；无读数保持未知">
                  <span className="status-dot" />
                  {northValue === null ? '未知' : '有读数'}
                </span>
                {version && <span className="wb-tag wb-tag-outline wb-mono">{version}</span>}
              </div>
            </div>
            <div className="detail-grid">
              {rows.map((row) => (
                <React.Fragment key={row.k}>
                  <div className="detail-k">{row.k}</div>
                  <div className={`detail-v${'mono' in row && row.mono ? ' mono' : ''}`}>
                    {row.v}
                  </div>
                </React.Fragment>
              ))}
            </div>
          </section>

          <section className="card">
            <span className="card-kicker">北极星指标</span>
            <span className="card-title">
              {north?.name ?? (charter?.opportunity?.trim() || '（未配置）')}
            </span>
            <div className="row-start">
              <h2 className="metric-value">
                {northValue === null ? '—' : `${northValue}${north?.unit ?? ''}`}
              </h2>
              {north?.target && <span className="metric-target">目标 {north.target}</span>}
              <span className="wb-tag wb-tag-neutral">{northLabel}</span>
            </div>
          </section>
        </div>

        <section className="card" id="version-card">
          <div className="card-head">
            <div className="row-between">
              <h6>版本计划与验收</h6>
              {version === currentVersion && (
                <span className="wb-tag wb-tag-warning">当前选版</span>
              )}
            </div>
            <div className="tabs" role="tablist" aria-label="版本">
              {versions.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="tab"
                  role="tab"
                  aria-selected={item === version}
                  onClick={() => setSelectedVersion(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          {!version ? (
            <p className="wb-muted">尚无版本材料或归档记录。</p>
          ) : (
            <div className="goal-week">
              <div>
                <span className="card-kicker">计划纪要</span>
                <div className="text-box">
                  {minutes?.plan ? (
                    <>
                      <pre className="wb-pre">{minutes.plan.text}</pre>
                      <span className="wb-muted">{minutes.plan.source}</span>
                    </>
                  ) : (
                    <span className="wb-muted">该版本无计划归档记录</span>
                  )}
                </div>
              </div>
              <div>
                <span className="card-kicker">验收纪要</span>
                <div className="text-box">
                  {minutes?.acceptance ? (
                    <>
                      {minutes.acceptance.document.results.map((result) => {
                        const goal = minutes.planDocument?.goals.find(
                          (item) => item.goalId === result.goalId
                        )
                        return (
                          <p key={result.goalId} className="wb-ov-result">
                            <b>{goal?.title ?? result.goalId}</b>
                            {result.decision
                              ? ` · ${
                                  result.decision.outcome === 'met'
                                    ? '达成'
                                    : result.decision.outcome === 'not-met'
                                      ? '未达'
                                      : '待决'
                                }（${result.decision.recordedAt}）`
                              : ' · 未结论'}
                            {result.note ? `：${result.note}` : ''}
                          </p>
                        )
                      })}
                      {distribution.length > 0 && (
                        <p className="wb-muted">
                          Issue 快照：
                          {distribution.map(([state, count]) => `${state} ${count}`).join(' · ')}
                        </p>
                      )}
                      <span className="wb-muted">{minutes.acceptance.source}</span>
                    </>
                  ) : (
                    <span className="wb-muted">该版本无验收归档记录</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
