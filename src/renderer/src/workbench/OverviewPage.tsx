import React, { useMemo, useState, useRef } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import {
  parseExecutionHostId,
  getRepoExecutionHostId,
  getWorktreeExecutionHostId
} from '../../../shared/execution-host'
import { openAddProject, useProjectPage } from './project-page-state'
import { CharterPrNotice } from './charter-pr-notice'
import { useCharterPrStatus } from './use-charter-pr-status'
import { charterSourceKey, loadRepoCharter, useRepoCharterSnapshot } from './charter-snapshot'
import { invalidateWallRepo, useWallRefresh } from './wall-refresh'
import { findWallProjectForRepo, useWallProjects } from './use-wall-projects'
import { useWallVersionLabel } from './use-wall-readings'
import { ProjectSettingsRail } from './ProjectSettingsRail'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { findRepoForHost } from '@/store/slices/repo-host-identity'
import { updateTrunkCode, trunkUpdateNotice } from './version-cycle/trunk-update-port'
import {
  nativeWorkspaceScope,
  nativeWorkspaceScopeKey,
  type NativeWorkspaceScope
} from './version-cycle/native-workspace'
import { useVersionMinutes } from './use-version-minutes'
import { OverviewScoreboard, SCOREBOARD_GRANULARITY } from './overview-scoreboard'
import { ProjectCard } from './overview-project-card'
import { MetricProblemsPanel } from './metric-problems-panel'
import { useOverviewMetricCollection } from './use-overview-metric-collection'
import { useOverviewHistory } from './use-overview-history'
import { useMetricsSetup } from './version-cycle/metrics-setup'
import { findCycleWorktree } from './version-cycle/native-cycle-workspace'
import { ProjectMilestones } from './project-milestones'
import { compareMaterialVersions } from '../../../shared/workbench/version-catalog'
import { ArrowDownToLine, RefreshCw } from 'lucide-react'
import './workbench-overview.css'

export function OverviewPage(): React.JSX.Element {
  const repos = useAppStore((s) => s.repos)
  const activeRepoId = useAppStore((s) => s.activeRepoId)
  const activeHostId = useAppStore((s) => s.activeWorkspaceExecutionHostId)
  const registeredWorktrees = useAppStore((s) =>
    activeRepoId ? s.worktreesByRepo[activeRepoId] : undefined
  )
  // Why: 项目总览按点击时写入的来源对读取；找不到同一来源就如实空态，
  // 不再退回 repos[0] 把另一个项目的读数当成当前项目。
  const activeRepo = activeRepoId
    ? (findRepoForHost(repos, activeRepoId, { hostId: activeHostId ?? undefined }) ??
      repos.find((repo) => repo.id === activeRepoId) ??
      null)
    : null
  const repoWorktrees = useMemo(
    () =>
      registeredWorktrees?.filter(
        (tree) =>
          activeRepo &&
          getWorktreeExecutionHostId(tree, activeRepo) === getRepoExecutionHostId(activeRepo)
      ),
    [registeredWorktrees, activeRepo]
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const discardSettings = useRef<(() => void) | null>(null)

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
  const milestoneScope = useMemo(
    () => (baseScope && baseWorktreeId ? { ...baseScope, worktreeId: baseWorktreeId } : null),
    [baseScope, baseWorktreeId]
  )

  const charterKey = activeRepo ? charterSourceKey(activeRepo) : 'none'
  const charterRead = useRepoCharterSnapshot(activeRepo ?? undefined)
  const charter = charterRead?.charter ?? null
  const projectPage = useProjectPage()
  const filters =
    projectPage?.kind === 'project-overview' &&
    activeRepo?.id === projectPage.options.repoId &&
    getRepoExecutionHostId(activeRepo) === projectPage.options.hostId
      ? projectPage.options.filters
      : undefined
  const wallProjects = useWallProjects(filters)
  const wallRefresh = useWallRefresh()
  const charterVersion = useWallVersionLabel(
    activeRepo ? findWallProjectForRepo(wallProjects, activeRepo) : undefined,
    wallRefresh
  )
  const identity = baseScope ? nativeWorkspaceScopeKey(baseScope) : (activeRepoId ?? 'none')
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
  // 「更新代码」后 history/metrics 快照由按钮 handler 各自的 force reload 就地刷新，
  // 不换键、不清空显示。
  const [updatingTrunk, setUpdatingTrunk] = useState(false)
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
    granularity: SCOREBOARD_GRANULARITY
  })
  const { catalog, zoneReadings, busy, refreshing, refreshReadings, reloadCatalog } = metrics
  const historyState = useOverviewHistory({
    baseScope,
    baseWorktreeId,
    planWorktreeId: fixedTrees.plan,
    acceptanceWorktreeId: fixedTrees.acceptance,
    identity: dataIdentity
  })
  const { history, currentVersion } = historyState
  const problems = [...metrics.problems, ...(historyState.problem ? [historyState.problem] : [])]

  // 主检出没有名片才查 PR 状态:待合入 / 已合入未更新 / 没查成(spec 规则 2)。
  const { charterStatus, refreshCharterStatus } = useCharterPrStatus(
    charterRead && !charterRead.error ? (activeRepo ?? undefined) : undefined,
    Boolean(charter),
    charterKey
  )

  // 「更新代码」点击处理；updatingTrunk 状态声明在 dataIdentity 之前。
  const updateTrunk = async () => {
    if (!activeRepo || updatingTrunk) {
      return
    }
    setUpdatingTrunk(true)
    try {
      const host = parseExecutionHostId(baseScope?.hostId ?? '')
      if (host?.kind === 'ssh') {
        // SSH 项目的主检出走原生远端快进链（与项目墙名片更新同一条）。
        await window.api.git.fastForward({
          worktreePath: activeRepo.path,
          ...(activeRepo.connectionId ? { connectionId: activeRepo.connectionId } : {})
        })
        toast.message('主检出已拉到最新')
      } else if (baseScope && baseWorktreeId) {
        const result = await updateTrunkCode(
          { repoId: baseScope.repoId, worktreeId: baseWorktreeId, hostId: baseScope.hostId },
          baseScope.runtimeOwnerEnvironmentId
        )
        toast.message(trunkUpdateNotice(result))
      }
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason)
      toast.message(`代码未更新（${detail}）。请让会话模型处理主检出的代码更新。`)
    } finally {
      setUpdatingTrunk(false)
      // 无论快进成败都重读：快照就地强制重读（旧值保持显示、错误系列保留上次数据
      // 回退），名片文件与 PR 状态一并刷新。
      historyState.reload()
      reloadCatalog()
      refreshCharterStatus()
      invalidateWallRepo(activeRepo)
      if (activeRepo.kind !== 'folder') {
        void loadRepoCharter(activeRepo, true)
      }
    }
  }

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
    return [...found].sort((a, b) => compareMaterialVersions(b, a))
  }, [history, currentVersion])
  const version = currentVersion ?? versions[0] ?? null
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
            <p style={{ margin: '0 0 12px', fontSize: 14 }}>
              {repos.length ? '尚未选择项目。' : '还没有添加项目。'}
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 12.5, opacity: 0.65 }}>
              {repos.length
                ? '从项目墙或侧栏选择项目后，可在这里查看项目总览。'
                : '添加项目后，可在这里查看项目总览。'}
            </p>
            <button
              type="button"
              className="wb-btn wb-btn-primary"
              onClick={() => openAddProject()}
            >
              + 添加项目
            </button>
          </section>
        </div>
      </div>
    )
  }
  const projectName = charter?.name?.trim() || activeRepo.displayName || activeRepo.id

  return (
    <TooltipProvider>
      <div className="wb-overview-with-settings">
        <div className="wb-ov">
          <header className="page-head">
            <h1>总览</h1>
            <button
              type="button"
              className="wb-btn wb-btn-secondary wb-btn-sm"
              disabled={updatingTrunk || !baseScope || !baseWorktreeId}
              title="把主检出快进到主干最新，并重读总览数据；快进不了会保持原样并说明原因"
              onClick={() => void updateTrunk()}
            >
              {updatingTrunk ? (
                '正在更新…'
              ) : (
                <>
                  <ArrowDownToLine size={14} aria-hidden="true" /> 更新代码
                </>
              )}
            </button>
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
            <ProjectCard
              onEdit={activeRepo.kind !== 'folder' ? () => setSettingsOpen(true) : undefined}
              projectName={projectName}
              charter={charter}
              version={charterVersion}
              notice={
                !charter ? (
                  <CharterPrNotice
                    status={charterStatus}
                    variant="overview"
                    updating={updatingTrunk}
                    onUpdateMain={
                      baseScope && baseWorktreeId ? () => void updateTrunk() : undefined
                    }
                  />
                ) : undefined
              }
            />

            <ProjectMilestones
              scope={milestoneScope}
              refreshToken={history?.baselineCommit}
              updateFormal={updateTrunk}
            />

            <OverviewScoreboard
              catalog={catalog}
              readings={zoneReadings}
              busy={busy}
              onRefresh={() => void refreshReadings()}
              anchor={metrics.anchor}
              identity={identity}
              plan={minutes?.planDocument ?? null}
              version={version}
              setupBusy={metricsSetup.busy || !baseScope}
              onSetup={() => void metricsSetup.prepareMetrics()}
              worktreeId={baseWorktreeId}
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
        {settingsOpen && activeRepo.kind !== 'folder' && (
          <ProjectSettingsRail
            key={charterKey}
            repo={activeRepo}
            displayName={projectName}
            onClose={() => {
              if (!settingsBusy) {
                if (settingsDirty) {
                  setConfirmClose(true)
                } else {
                  setSettingsOpen(false)
                }
              }
            }}
            onDirtyChange={setSettingsDirty}
            onBusyChange={setSettingsBusy}
            discardRef={discardSettings}
            onChanged={refreshCharterStatus}
          />
        )}
        <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
          <DialogContent>
            <DialogTitle>还有未提交的修改</DialogTitle>
            <DialogDescription>关闭设置会丢弃这些修改。</DialogDescription>
            <Button variant="ghost" onClick={() => setConfirmClose(false)}>
              继续编辑
            </Button>
            <Button
              onClick={() => {
                discardSettings.current?.()
                setConfirmClose(false)
                setSettingsOpen(false)
              }}
            >
              丢弃并关闭
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
