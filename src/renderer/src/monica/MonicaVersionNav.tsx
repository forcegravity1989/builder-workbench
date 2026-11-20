import { worktreeActivationHostOpts } from './worktree-activation-host-opts'
import { versionMaterialSelection, versionTreeKey } from './version-material-selection'
import { findVersionFlowWorktrees } from '../../../shared/monica/version-workspace-match'
import { openMonicaWorkspaceChoice } from './version-workspace-choice-state'
import type { Worktree } from '../../../shared/worktree/types'
import { notifyMonicaError } from './error-feedback'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CircleHelp, Layers, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { isVersionFlowWorkflow } from '../../../shared/monica/version-workspace-prepare'
import { Button } from '@/components/ui/button'
import { WORKTREE_SIDEBAR_VIRTUAL_ROW_GAP } from '@/components/sidebar/worktree-list/viewport/virtual-rows'
import type { VersionWorkflow } from '../../../shared/monica/version-document'
import { normalizeStoredMonicaVersionBinding } from '../../../shared/monica/version-binding'
import type { VersionCatalogEntry } from '../../../shared/monica/version-catalog'
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
import { openVersionOverview, useProjectPage } from './project-page-state'
import { getRepoExecutionHostId, toRuntimeExecutionHostId } from '../../../shared/execution-host'
import type { Repo } from '../../../shared/repo-types'
import { versionRepoIdentity } from '../../../shared/monica/version-repo-identity'
import { replayMonicaGuide, useMonicaScreenGuide } from './MonicaScreenGuide'
import { useMonicaScreenUsage } from './monica-screen-usage'
import { MonicaSidebarSectionHeader } from './MonicaSidebarSectionHeader'
import { useCycleView } from './cycle-view-state'
import { getWorktreeHostIdentity } from '../../../shared/worktree/host-qualified-identity'
import { VersionTreeDisplayProvider, type VersionTreeDisplayInput } from './VersionNativeTrees'
import { VersionCatalogSourceProblem } from './VersionCatalogSourceProblem'
import {
  consumeVersionSidebarFocus,
  publishVersionSidebarProjection,
  useVersionSidebarFocusRequest
} from './version-sidebar-state'

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

export function MonicaVersionNav({
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
  const taskScope = useAppStore((s) => s.taskPageData.monicaTaskScope ?? null)
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
      const binding = normalizeStoredMonicaVersionBinding(activeWorktree.workbenchVersionBinding)
      const hostId = worktreeActivationHostOpts(activeWorktree)?.executionHostId
      if (binding && hostId) {
        return { repoId: activeWorktree.repoId, hostId, version: binding.version }
      }
    }
    return undefined
  }, [activeView, activeWorktree, projectPage, taskScope, taskRepoId, taskRepoMatches])
  const project = useProjectVersionCatalog(repo, undefined, preference)
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

  useMonicaScreenGuide(
    'monica-versions',
    !dialog &&
      materialReady &&
      !project.loading &&
      activeView === 'terminal' &&
      !activeWorktree?.workbenchVersionBinding
  )
  // Why: the version sidebar is the primary surface exactly when no version is
  // bound; guide-only flags (dialog/material) gate tours, not usage counting.
  useMonicaScreenUsage(
    'monica-versions',
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
            const binding = normalizeStoredMonicaVersionBinding(tree.workbenchVersionBinding)
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
    const latest = entries[0]
    if (!latest) {
      return
    }
    setExpandedOverrideAndStore(new Set([...expandedVersions, latest.version]))
    requestAnimationFrame(() => {
      const state = useAppStore.getState()
      const current = currentProjectRepo(state)
      if (current && resolveProjectSource(state, current)?.id === repoId) {
        versionElements.current
          .get(latest.version)
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

  const toggleVersion = useCallback(
    (version: string) => {
      const next = new Set(expandedVersions)
      if (next.has(version)) {
        next.delete(version)
      } else {
        next.add(version)
      }
      setExpandedOverrideAndStore(next)
    },
    [expandedVersions, setExpandedOverrideAndStore]
  )

  const activeBinding =
    activeWorktree &&
    !activeWorktree.isArchived &&
    project.worktrees.some((tree) => versionTreeKey(tree) === versionTreeKey(activeWorktree))
      ? normalizeStoredMonicaVersionBinding(activeWorktree.workbenchVersionBinding)
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
        notifyMonicaError('无法切换版本', reason, '检查项目工作区后重试。')
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
    const openOverviewFromTree = (tree: Worktree) => {
      try {
        const selection = versionMaterialSelection(tree)
        if (!selection) {
          throw new Error('该流程工作区已变化')
        }
        openVersionOverview({ ...selection, version: entry.version })
      } catch (error) {
        notifyMonicaError('无法打开版本总览', error, '请刷新登记后重新选择工作区。')
      }
    }
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
      for (const workflow of ['plan', 'acceptance'] as const) {
        const candidates = findVersionFlowWorktrees(source.state.worktrees, {
          version: entry.version,
          workflow
        })
        if (candidates.length > 1 && !entry.material[workflow]) {
          openMonicaWorkspaceChoice({
            title: `${entry.version} · 选择总览的${workflow === 'plan' ? '计划' : '验收'}工作区`,
            candidates,
            onChoose: openOverviewFromTree
          })
          return
        }
      }
      openVersionOverview({
        repoId: source.repo.id,
        hostId: getRepoExecutionHostId(source.repo),
        version: entry.version
      })
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
          expanded={expandedVersions.has(entry.version)}
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
                      notifyMonicaError('无法打开版本任务', error, '刷新登记后重新选择工作区。')
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
      className="monica-versions flex min-h-0 min-w-0 flex-col"
      style={{ rowGap: WORKTREE_SIDEBAR_VIRTUAL_ROW_GAP }}
      data-monica-versions
    >
      <MonicaSidebarSectionHeader
        icon={Layers}
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
        action={
          <>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="版本工作区帮助"
              title="版本工作区帮助"
              onClick={() => replayMonicaGuide('monica-versions')}
            >
              <CircleHelp className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              data-contextual-tour-target="monica-versions-start"
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
      </MonicaSidebarSectionHeader>

      {!collapsed ? (
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
    <VersionTreeDisplayProvider value={nativeDisplay} trees={project.worktrees}>
      {project.catalogReaders}
      {content}
    </VersionTreeDisplayProvider>
  )
}
