import { getRepoRowIdentity } from '@/store/repos/repo-host-identity'
import { worktreeActivationHostOpts } from './worktree-activation-host-opts'
import { versionTreeKey } from './version-material-selection'
import {
  openOverviewFromCatalog,
  openOverviewFromWorktree
} from './version-overview/open-version-overview'
import type { Worktree } from '../../../shared/worktree/types'
import { notifyWorkbenchError } from './error-feedback'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CircleHelp, Layers, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { isVersionFlowWorkflow } from '../../../shared/workbench/version-workspace-prepare'
import { Button } from '@/components/ui/button'
import { WORKTREE_SIDEBAR_VIRTUAL_ROW_GAP } from '@/components/sidebar/worktree-list/viewport/virtual-rows'
import type { VersionWorkflow } from '../../../shared/workbench/version-document'
import { normalizeStoredWorkbenchVersionBinding } from '../../../shared/workbench/version-binding'
import type { VersionCatalogEntry } from '../../../shared/workbench/version-catalog'
import { useProjectVersionCatalog } from './project-version-catalog'
import { useBrowsedVersion } from './version-context-state'
import {
  chooseVersionSourceWorkspace,
  initializeVersionWorkspace,
  navigateVersionWorkflow,
  openVersionTasks,
  openVersionTasksFromWorkspace,
  startVersionGoal
} from './version-nav-actions'
import { VersionCleanupDialog } from './version-cleanup-dialog'
import { VersionNavGroup } from './version-nav-group'
import { VersionSidebarPreview } from './VersionSidebarPreview'
import { NewVersionDialog } from './NewVersionDialog'
import { openGoalWorkspace } from './scoped-task-workspace'
import { currentProjectRepo, resolveProjectSource } from './project-source-resolution'
import { useProjectPage } from './project-page-state'
import { toRuntimeExecutionHostId } from '../../../shared/execution-host/execution-host'
import type { Repo } from '../../../shared/repository/repo-types'
import { versionRepoIdentity } from '../../../shared/workbench/version-repo-identity'
import {
  cancelWorkbenchGuide,
  replayWorkbenchGuide,
  useWorkbenchScreenGuide
} from './WorkbenchScreenGuide'
import { useWorkbenchScreenUsage } from './workbench-screen-usage'
import { WorkbenchSidebarSectionHeader } from './WorkbenchSidebarSectionHeader'
import { useCycleView } from './cycle-view-state'
import { getWorktreeHostIdentity } from '../../../shared/worktree/host-qualified-identity'
import { VersionTreeDisplayProvider, type VersionTreeDisplayInput } from './VersionNativeTrees'
import { VersionCatalogSourceProblem } from './VersionCatalogSourceProblem'
import {
  clearNavigationVersion,
  consumeVersionSidebarFocus,
  useNavigationVersion,
  publishVersionSidebarProjection,
  useVersionSidebarFocusRequest
} from './version-sidebar-state'
import { useVersionTreeWorktreeReveal } from './use-version-tree-worktree-reveal'

type DialogState = { mode: 'create' } | { mode: 'cleanup'; version: string } | null

function readExpandedStore(key: string | null): Set<string> | null {
  if (!key) {
    return null
  }
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return null
    }
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? new Set(parsed.filter((value): value is string => typeof value === 'string'))
      : null
  } catch {
    return null
  }
}

export function WorkbenchVersionNav({
  nativeDisplay,
  repo
}: {
  nativeDisplay: VersionTreeDisplayInput
  repo: Repo
}): React.JSX.Element {
  const repoId = repo.id
  const projectName = repo.displayName.trim()
  const activeView = useAppStore((s) => s.activeView)
  const activeWorktree = useAppStore((s) =>
    s.activeWorktreeId
      ? s.getKnownWorktreeById(s.activeWorktreeId, s.activeWorkspaceExecutionHostId ?? undefined)
      : null
  )
  const taskScope = useAppStore((s) => s.taskPageData.workbenchTaskScope ?? null)
  const taskRepoId = useAppStore((s) => s.taskPageData.preselectedRepoId)
  const taskRepoMatches = useAppStore((s) => {
    const identity = versionRepoIdentity(repo)
    return s.repos.some(
      (row) =>
        row.id === s.taskPageData.preselectedRepoId &&
        (row.id === repo.id || (identity !== null && versionRepoIdentity(row) === identity))
    )
  })
  const cycleView = useCycleView()
  const projectPage = useProjectPage()
  const [dialog, setDialog] = useState<DialogState>(null)
  // Why: 已固定/版本/工作区 share one accordion; 版本 collapses its own row list.
  const [collapsed, setCollapsed] = useState(false)
  const preference = useMemo(() => {
    if (activeView === 'activity' && projectPage?.kind === 'version-overview') {
      return projectPage.options
    }
    if (
      activeView === 'tasks' &&
      taskScope &&
      taskRepoId &&
      taskScope.homeHostId &&
      taskRepoMatches
    ) {
      return {
        version: taskScope.version,
        repoId: taskRepoId,
        hostId: taskScope.runtimeOwnerEnvironmentId
          ? toRuntimeExecutionHostId(taskScope.runtimeOwnerEnvironmentId)
          : taskScope.homeHostId
      }
    }
    if (activeView === 'terminal' && activeWorktree && !activeWorktree.isArchived) {
      const binding = normalizeStoredWorkbenchVersionBinding(activeWorktree.workbenchVersionBinding)
      const hostId = worktreeActivationHostOpts(activeWorktree)?.executionHostId
      if (binding && hostId) {
        return { repoId: activeWorktree.repoId, hostId, version: binding.version }
      }
    }
    return undefined
  }, [activeView, activeWorktree, projectPage, taskScope, taskRepoId, taskRepoMatches])
  const navigationReveal = useNavigationVersion(getRepoRowIdentity(repo))
  const project = useProjectVersionCatalog(repo, undefined, preference, Boolean(navigationReveal))
  const catalog = project.primary
  const materialReady = catalog?.materialReady ?? false
  const hasSourceProblems = project.sourceProblems.length > 0
  const overviewVersion =
    activeView === 'activity' &&
    projectPage?.kind === 'version-overview' &&
    project.repoIds.includes(projectPage.options.repoId)
      ? projectPage.options.version
      : null
  const browsedVersion = useBrowsedVersion(repoId)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const focusRequest = useVersionSidebarFocusRequest()
  const sectionCollapsed = collapsed && !navigationReveal
  const versionElements = useRef(new Map<string, HTMLDivElement>())

  const expandedKey = repoId ? `workbench.version-expanded:${repoId}` : null
  // Expansion belongs to the project, including an explicitly collapsed empty set.
  const [expandedByProject, setExpandedByProject] = useState<Record<string, Set<string>>>({})
  const expandedOverride = useMemo(
    () => (expandedKey ? (expandedByProject[expandedKey] ?? readExpandedStore(expandedKey)) : null),
    [expandedByProject, expandedKey]
  )
  const setExpandedOverrideAndStore = useCallback(
    (versions: Set<string>) => {
      if (!expandedKey) {
        return
      }
      setExpandedByProject((current) => ({ ...current, [expandedKey]: versions }))
      try {
        window.localStorage.setItem(expandedKey, JSON.stringify([...versions]))
      } catch {
        // 存储被拒时本会话导航不受影响。
      }
    },
    [expandedKey]
  )

  useWorkbenchScreenGuide(
    'workbench-versions',
    !dialog &&
      materialReady &&
      !project.loading &&
      activeView === 'terminal' &&
      !activeWorktree?.workbenchVersionBinding
  )
  // Why: the version sidebar is the primary surface exactly when no version is
  // bound; guide-only flags (dialog/material) gate tours, not usage counting.
  useWorkbenchScreenUsage(
    'workbench-versions',
    activeView === 'terminal' && !activeWorktree?.workbenchVersionBinding
  )

  const ordered = project.versions
  const entries = useMemo(() => ordered.map(({ entry }) => entry), [ordered])
  const versionByName = useMemo(
    () => new Map(ordered.map((row) => [row.entry.version, row])),
    [ordered]
  )
  const expandedVersions = useMemo(() => {
    if (expandedOverride) {
      return expandedOverride
    }
    // 默认姿态：在制版本与当前浏览版本展开；历史（retired）收起、可展开回看。
    const seeded = new Set(
      entries.filter((entry) => entry.state === 'working').map((entry) => entry.version)
    )
    if (browsedVersion) {
      seeded.add(browsedVersion)
    }
    return seeded
  }, [expandedOverride, entries, browsedVersion])

  useEffect(() => {
    const versions = new Set(entries.map((entry) => entry.version))
    publishVersionSidebarProjection({
      repoId,
      worktreeIdentities: new Set(
        project.worktrees
          .filter((tree) => {
            const binding = normalizeStoredWorkbenchVersionBinding(tree.workbenchVersionBinding)
            return !tree.isArchived && !!binding && versions.has(binding.version)
          })
          .map(getWorktreeHostIdentity)
      )
    })
  }, [repoId, project.worktrees, entries])

  useEffect(() => {
    if (
      !focusRequest ||
      focusRequest.repoId !== repoId ||
      project.planOrderPending ||
      (!materialReady && !hasSourceProblems)
    ) {
      return
    }
    consumeVersionSidebarFocus(focusRequest.sequence)
    const selected = entries[0]
    if (!selected) {
      return
    }
    setExpandedOverrideAndStore(new Set([...expandedVersions, selected.version]))
    requestAnimationFrame(() => {
      const state = useAppStore.getState()
      const current = currentProjectRepo(state)
      if (current && resolveProjectSource(state, current)?.id === repoId) {
        versionElements.current
          .get(selected.version)
          ?.querySelector('button')
          ?.scrollIntoView({ block: 'nearest' })
      }
    })
  }, [
    focusRequest,
    repoId,
    materialReady,
    hasSourceProblems,
    project.planOrderPending,
    entries,
    expandedVersions,
    setExpandedOverrideAndStore
  ])

  const activeStep = useAppStore((state) =>
    state.activeContextualTourId === 'workbench-versions' ? state.activeContextualTourStepIndex : 0
  )
  const lastNavigationScroll = useRef('')
  useEffect(() => {
    if (!navigationReveal?.version) {
      return
    }
    const key = `${navigationReveal.sequence}:${activeStep}`
    if (lastNavigationScroll.current === key) {
      return
    }
    const row = versionElements.current.get(navigationReveal.version)
    const target =
      navigationReveal.guide && activeStep === 1
        ? row?.querySelector('[data-contextual-tour-target="workbench-versions-plan"]')
        : row?.querySelector('button')
    if (target) {
      target.scrollIntoView({ block: 'nearest' })
      lastNavigationScroll.current = key
    }
  }, [navigationReveal, activeStep, entries])

  const stopNavigationReveal = useCallback(() => {
    if (navigationReveal?.guide) {
      cancelWorkbenchGuide('workbench-versions')
    }
    if (navigationReveal) {
      clearNavigationVersion()
    }
  }, [navigationReveal])

  const toggleVersion = useCallback(
    (version: string) => {
      const next = new Set(expandedVersions)
      if (next.has(version) || navigationReveal?.version === version) {
        next.delete(version)
      } else {
        next.add(version)
      }
      stopNavigationReveal()
      setExpandedOverrideAndStore(next)
    },
    [expandedVersions, navigationReveal, setExpandedOverrideAndStore, stopNavigationReveal]
  )

  const versions = useMemo(() => entries.map((entry) => entry.version), [entries])
  const expandSection = useCallback(() => setCollapsed(false), [])
  const expandVersion = useCallback(
    (version: string) => setExpandedOverrideAndStore(new Set([...expandedVersions, version])),
    [expandedVersions, setExpandedOverrideAndStore]
  )
  const treeReveal = useVersionTreeWorktreeReveal({
    repoId,
    worktrees: project.worktrees,
    versions,
    materialReady,
    hasSourceProblems,
    planOrderPending: project.planOrderPending,
    expandedVersions,
    expandVersion,
    expandSection
  })

  const activeBinding =
    activeWorktree &&
    !activeWorktree.isArchived &&
    project.worktrees.some((tree) => versionTreeKey(tree) === versionTreeKey(activeWorktree))
      ? normalizeStoredWorkbenchVersionBinding(activeWorktree.workbenchVersionBinding)
      : null
  const activeTaskVersion =
    activeView === 'tasks' && (!taskRepoId || taskRepoMatches) ? taskScope?.version : null
  const activeTreeVersion = activeView === 'terminal' ? activeBinding?.version : null
  const activeVersion =
    overviewVersion ??
    activeTaskVersion ??
    activeTreeVersion ??
    (activeView === 'artifacts' ? browsedVersion : null)
  const activeObjectKey =
    activeTreeVersion && activeWorktree
      ? getWorktreeHostIdentity(activeWorktree)
      : activeTaskVersion
        ? (taskScope?.goalId ?? '')
        : ''

  const busy = useCallback(
    async (key: string, run: () => Promise<void>) => {
      if (busyKey) {
        return
      }
      setBusyKey(key)
      try {
        await run()
      } catch (reason) {
        notifyWorkbenchError('无法切换版本', reason, '检查项目工作区后重试。')
      } finally {
        setBusyKey(null)
      }
    },
    [busyKey]
  )

  function renderVersionRow(entry: VersionCatalogEntry): React.JSX.Element {
    const row = versionByName.get(entry.version)
    const source = row?.source
    const versionCatalog = source?.state ?? null
    const sourceReady = !!versionCatalog?.scope && !versionCatalog.error
    const openOverviewFromTree = (tree: Worktree) => openOverviewFromWorktree(tree, entry.version)
    const openOverview = () => {
      if (
        activeView === 'terminal' &&
        activeWorktree &&
        activeBinding?.version === entry.version &&
        isVersionFlowWorkflow(activeBinding.workflow)
      ) {
        openOverviewFromTree(activeWorktree)
        return
      }
      if (!source) {
        if (
          !chooseVersionSourceWorkspace({
            purpose: 'overview',
            version: entry.version,
            worktrees: project.worktrees,
            onChoose: openOverviewFromTree
          })
        ) {
          toast.error('该版本的材料来源尚未就绪，请检查主机连接。')
        }
        return
      }
      openOverviewFromCatalog(source.repo, source.state.worktrees, entry)
    }
    const activeWorkflow: VersionWorkflow | null =
      activeBinding && activeBinding.version === entry.version
        ? isVersionFlowWorkflow(activeBinding.workflow)
          ? activeBinding.workflow
          : null
        : activeView === 'artifacts' && browsedVersion === entry.version
          ? cycleView
          : null
    return (
      <div
        key={entry.version}
        ref={(node) => {
          if (node) {
            versionElements.current.set(entry.version, node)
          } else {
            versionElements.current.delete(entry.version)
          }
        }}
      >
        <VersionNavGroup
          entry={entry}
          expanded={
            expandedVersions.has(entry.version) || navigationReveal?.version === entry.version
          }
          guidedVersion={navigationReveal?.guide ? navigationReveal.version : undefined}
          browsed={browsedVersion === entry.version}
          busy={busyKey !== null}
          initializing={busyKey === `${entry.version}:init`}
          worktrees={project.worktrees}
          goalWorktrees={row?.goalWorktrees ?? []}
          initializationTrees={versionCatalog?.worktrees ?? []}
          canInitialize={sourceReady && !!versionCatalog?.materialReady}
          activeWorkflow={
            activeView === 'terminal' || activeView === 'artifacts' ? activeWorkflow : null
          }
          activeTasks={activeTaskVersion === entry.version && !taskScope?.goalId}
          activeOverview={overviewVersion === entry.version}
          onOverview={openOverview}
          activeGoalId={activeTaskVersion === entry.version ? (taskScope?.goalId ?? null) : null}
          onToggle={() => toggleVersion(entry.version)}
          onCleanup={() => setDialog({ mode: 'cleanup', version: entry.version })}
          onNavigateWorkflow={(workflow) =>
            navigateVersionWorkflow({
              catalog: versionCatalog,
              worktrees: project.worktrees,
              version: entry.version,
              workflow,
              projectKey: repoId
            })
          }
          onInitialize={() =>
            void busy(`${entry.version}:init`, async () => {
              if (versionCatalog && sourceReady) {
                await initializeVersionWorkspace({
                  catalog: versionCatalog,
                  version: entry.version
                })
              }
            })
          }
          onOpenTasks={(goal) =>
            void busy(`${entry.version}:${goal?.goalId ?? 'all'}:tasks`, async () => {
              if (versionCatalog && sourceReady) {
                await openVersionTasks({
                  catalog: versionCatalog,
                  version: entry.version,
                  goal: goal ?? null,
                  entry
                })
                return
              }
              if (
                !goal &&
                chooseVersionSourceWorkspace({
                  purpose: 'tasks',
                  version: entry.version,
                  worktrees: project.worktrees,
                  onChoose: (tree) => {
                    try {
                      openVersionTasksFromWorkspace(tree, entry.version)
                    } catch (error) {
                      notifyWorkbenchError('无法打开版本任务', error, '刷新登记后重新选择工作区。')
                    }
                  }
                })
              ) {
                return
              }
              toast.error('该版本的材料来源尚未就绪。打开此版本的工作区，或检查主机连接。')
            })
          }
          onStartGoal={(goal) =>
            void busy(`${entry.version}:${goal.goalId}:start`, async () => {
              if (versionCatalog && sourceReady) {
                await startVersionGoal({ catalog: versionCatalog, version: entry.version, goal })
              }
            })
          }
          onOpenGoalWorkspace={(goal) => {
            const opened = openGoalWorkspace({
              version: entry.version,
              goalId: goal.goalId,
              label: `${goal.label} · ${goal.title}`,
              worktrees: row?.goalWorktrees ?? []
            })
            if (!opened) {
              toast.info('此目标尚无工作区；可用「目标开工」按需创建。')
            }
          }}
        />
      </div>
    )
  }

  const content = (
    <div
      className="wb-versions flex min-h-0 min-w-0 flex-col"
      style={{ rowGap: WORKTREE_SIDEBAR_VIRTUAL_ROW_GAP }}
      data-workbench-versions
    >
      <WorkbenchSidebarSectionHeader
        icon={Layers}
        collapsed={sectionCollapsed}
        onToggle={() => {
          stopNavigationReveal()
          setCollapsed(!sectionCollapsed)
        }}
        action={
          <>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="版本工作区帮助"
              title="版本工作区帮助"
              onClick={() => replayWorkbenchGuide('workbench-versions')}
            >
              <CircleHelp className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              data-contextual-tour-target={
                navigationReveal?.guide && navigationReveal.version
                  ? undefined
                  : 'workbench-versions-start'
              }
              aria-label="新建版本"
              title="新建版本"
              onClick={() => setDialog({ mode: 'create' })}
            >
              <Plus className="size-3.5" />
            </Button>
          </>
        }
      >
        版本
      </WorkbenchSidebarSectionHeader>

      {!sectionCollapsed ? (
        <>
          {project.sourceProblems.map(({ key, ...problem }) => (
            <VersionCatalogSourceProblem key={key} {...problem} />
          ))}
          {!hasSourceProblems && project.loading && entries.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-worktree-sidebar-foreground/45">
              版本目录读取中…
            </p>
          ) : null}
          {!hasSourceProblems && !project.loading && entries.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-worktree-sidebar-foreground/45">
              暂无版本 · 保存版本计划或从「＋ 新建版本」开始
            </p>
          ) : null}
          <VersionSidebarPreview
            repoId={repoId}
            entries={entries}
            activeVersion={activeVersion}
            activeContextKey={`${activeView}:${activeObjectKey}`}
            versionElements={versionElements}
            renderRow={renderVersionRow}
            forceReveal={
              navigationReveal?.version
                ? {
                    version: navigationReveal.version,
                    sequence: navigationReveal.sequence,
                    onCollapse: stopNavigationReveal
                  }
                : treeReveal.forceReveal
            }
          />
        </>
      ) : null}

      {dialog?.mode === 'cleanup' ? (
        <VersionCleanupDialog
          version={dialog.version}
          entry={versionByName.get(dialog.version)?.entry ?? null}
          worktrees={project.worktrees}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.mode === 'create' && catalog ? (
        <NewVersionDialog
          catalog={catalog}
          projectKey={repoId}
          projectName={projectName}
          onCreated={(version) =>
            setExpandedOverrideAndStore(new Set([...expandedVersions, version]))
          }
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  )
  return (
    <VersionTreeDisplayProvider
      value={nativeDisplay}
      highlightedRevealRowKey={treeReveal.highlightedRevealRowKey}
    >
      {project.catalogReaders}
      {content}
    </VersionTreeDisplayProvider>
  )
}
