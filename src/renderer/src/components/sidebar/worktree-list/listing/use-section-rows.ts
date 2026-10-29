import { useCallback, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import type { FolderWorkspace } from '../../../../../../shared/folder-workspace-types'
import type { ProjectGroup } from '../../../../../../shared/project-group-types'
import type { ProjectOrderBy } from '../../../../../../shared/ui-chrome-types'
import type { Repo } from '../../../../../../shared/repo-types'
import type { WorkspaceStatusDefinition, Worktree } from '../../../../../../shared/worktree/types'
import type { WorktreeLineage } from '../../../../../../shared/worktree/lineage-types'
import type { ExecutionHostId } from '../../../../../../shared/execution-host'
import { getHostDisplayLabelOverrides } from '../../../../../../shared/host-setting-overrides'
import { buildRows } from '../grouping/build-rows'
import type { ProjectGroupingModel } from '../grouping/project-grouping'
import type { PinnedWorktreeDisplayPolicy, Row, WorktreeGroupBy } from '../grouping/row-types'
import { getLogicalRepoOrderRankById } from '../../project-header-drop'
import { getEmptyProjectPlaceholderRepoIds } from '../../empty-project-placeholder-repos'
import { addHostSectionRows } from '../../host-section-rows'
import { orderHostSectionOptions } from '../../host-section-order'
import { buildSidebarHostOptions } from '../../sidebar-host-options'
import { selectPendingWorktreeCreationKeys } from './pending-worktree-creation-keys'
import { projectWorkbenchRows } from './workbench-project-rows'
import { useWorkbenchProjectFold } from './use-workbench-project-fold'
import { useSidebarFoldActions } from '@/workbench/sidebar-fold'
import { collectRenderedSidebarRowKeys } from './collect-rendered-sidebar-row-keys'
type SectionRowsArgs = {
  workbenchProject?: { repoId: string; repoIds: readonly string[] }
  groupBy: WorktreeGroupBy
  projectOrderBy: ProjectOrderBy
  pinnedDisplayPolicy: PinnedWorktreeDisplayPolicy
  defaultHostId: ExecutionHostId
  worktrees: Worktree[]
  repos: readonly Repo[]
  repoMap: Map<string, Repo>
  worktreeMap: Map<string, Worktree>
  worktreeLineageById: Record<string, WorktreeLineage>
  prCache: AppState['prCache'] | null
  settings: AppState['settings']
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
  effectiveCollapsedGroups: Set<string>
  projectGrouping: ProjectGroupingModel
  visibleReposForRows: readonly Repo[]
  visibleProjectGroupsForRows: readonly ProjectGroup[]
  visibleFolderWorkspacesForRows: readonly FolderWorkspace[]
  importedWorktreesByRepo: Parameters<typeof buildRows>[14]
  newExternalWorktreesInboxByRepo: Parameters<typeof buildRows>[15]
  filterRepoIds: readonly string[]
  visibleWorkspaceHostIds: readonly ExecutionHostId[] | null
  workspaceHostScope: AppState['workspaceHostScope']
}

// Builds the full sidebar row model: grouped worktree rows first, then the host-section
// tier wrapped around them.
export function useSidebarSectionRows(args: SectionRowsArgs) {
  const { repos, worktrees, repoMap, effectiveCollapsedGroups, defaultHostId } = args
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const sshTargetLabels = useAppStore((s) => s.sshTargetLabels)
  const sshConnectionStates = useAppStore((s) => s.sshConnectionStates)
  const runtimeEnvironments = useAppStore((s) => s.runtimeEnvironments)
  const runtimeStatusByEnvironmentId = useAppStore((s) => s.runtimeStatusByEnvironmentId)
  const workspaceHostOrder = useAppStore((s) => s.workspaceHostOrder)
  const setWorkspaceHostOrder = useAppStore((s) => s.setWorkspaceHostOrder)

  // Why: manual header order is bound to state.repos; Recent/Smart derive order from the sorted worktree stream.
  const repoOrder = useMemo(
    () => getLogicalRepoOrderRankById(repos.map((repo) => repo.id)),
    [repos]
  )
  const allRepoIds = useMemo(() => repos.map((r) => r.id), [repos])
  const placeholderRepoIds = useMemo(() => {
    const ids = new Set(
      getEmptyProjectPlaceholderRepoIds({
        groupBy: args.groupBy,
        repos: args.visibleReposForRows,
        worktreesByRepo,
        visibleWorktrees: worktrees,
        filterRepoIds: args.filterRepoIds
      })
    )
    if (args.workbenchProject) {
      for (const repo of args.visibleReposForRows) {
        if (args.workbenchProject.repoIds.includes(repo.id)) {
          ids.add(repo.id)
        }
      }
    }
    return ids
  }, [
    args.filterRepoIds,
    args.groupBy,
    args.visibleReposForRows,
    worktrees,
    worktreesByRepo,
    args.workbenchProject
  ])

  // Why: subscribe on a flat key array (useShallow) so progress ticks don't rebuild the whole row model.
  const pendingCreationKeys = useAppStore(
    useShallow((s) => selectPendingWorktreeCreationKeys(s.pendingWorktreeCreations))
  )
  const pendingCreations = useMemo(
    () =>
      pendingCreationKeys.map((key) => {
        const separator = key.indexOf(' ')
        return {
          creationId: key.slice(0, separator),
          repoId: key.slice(separator + 1)
        }
      }),
    [pendingCreationKeys]
  )
  const hostLabelOverrides = useMemo(
    () => getHostDisplayLabelOverrides(args.settings),
    [args.settings]
  )
  const hostOptions = useMemo(
    () =>
      buildSidebarHostOptions({
        repos,
        sshTargetLabels,
        sshConnectionStates,
        settings: args.settings,
        runtimeEnvironments,
        runtimeStatusByEnvironmentId,
        hostLabelOverrides
      }),
    [
      repos,
      sshTargetLabels,
      sshConnectionStates,
      args.settings,
      runtimeEnvironments,
      runtimeStatusByEnvironmentId,
      hostLabelOverrides
    ]
  )
  const hostLabelById = useMemo(
    () => new Map(hostOptions.map((host) => [host.id, host.label])),
    [hostOptions]
  )

  const buildGroupRows = useCallback(
    (collapsedGroups: Set<string>): Row[] =>
      buildRows(
        args.groupBy,
        worktrees,
        repoMap,
        args.prCache,
        collapsedGroups,
        repoOrder,
        args.workspaceStatuses,
        args.projectOrderBy,
        args.worktreeLineageById,
        args.worktreeMap,
        true,
        args.settings,
        args.visibleProjectGroupsForRows,
        placeholderRepoIds,
        args.importedWorktreesByRepo,
        args.newExternalWorktreesInboxByRepo,
        pendingCreations,
        args.projectGrouping,
        args.visibleFolderWorkspacesForRows,
        hostLabelById,
        defaultHostId,
        args.pinnedDisplayPolicy
      ),
    [
      args.groupBy,
      worktrees,
      repoMap,
      args.prCache,
      defaultHostId,
      repoOrder,
      args.workspaceStatuses,
      args.projectOrderBy,
      args.worktreeLineageById,
      args.worktreeMap,
      args.settings,
      args.projectGrouping,
      args.visibleProjectGroupsForRows,
      args.visibleFolderWorkspacesForRows,
      placeholderRepoIds,
      args.importedWorktreesByRepo,
      args.newExternalWorktreesInboxByRepo,
      pendingCreations,
      hostLabelById,
      args.pinnedDisplayPolicy
    ]
  )
  const rows = useMemo(
    () => buildGroupRows(effectiveCollapsedGroups),
    [buildGroupRows, effectiveCollapsedGroups]
  )
  const orderedHostOptions = useMemo(
    () => orderHostSectionOptions(hostOptions, workspaceHostOrder),
    [hostOptions, workspaceHostOrder]
  )
  const [hostDragActive, setHostDragActive] = useState(false)
  const handleReorderHostSections = useCallback(
    (orderedVisibleHostIds: ExecutionHostId[]) => {
      const visibleHostIds = new Set(orderedVisibleHostIds)
      const hostOptionIds = orderedHostOptions.map((host) => host.id)
      const knownHostIds = new Set(hostOptionIds)
      const nextOrder: ExecutionHostId[] = [...orderedVisibleHostIds]
      const seen = new Set(nextOrder)
      // Why: dragging only covers rendered hosts; keep non-rendered SSH/runtime hosts in the saved order so they return in place.
      for (const hostId of [...workspaceHostOrder, ...hostOptionIds]) {
        if (!knownHostIds.has(hostId) || visibleHostIds.has(hostId) || seen.has(hostId)) {
          continue
        }
        nextOrder.push(hostId)
        seen.add(hostId)
      }
      setWorkspaceHostOrder(nextOrder)
    },
    [orderedHostOptions, setWorkspaceHostOrder, workspaceHostOrder]
  )
  const nativeSectionRows = useMemo(
    () =>
      addHostSectionRows({
        rows,
        hostOptions: orderedHostOptions,
        workspaceHostScope: args.workspaceHostScope,
        visibleWorkspaceHostIds: args.visibleWorkspaceHostIds,
        defaultHostId,
        collapsedHostKeys: effectiveCollapsedGroups,
        forceCollapseHosts: hostDragActive,
        // Why: projects/workspaces are the primary sidebar object; host sections are only an explicit host-filter view.
        preferProjectGrouping: true
      }),
    [
      args.visibleWorkspaceHostIds,
      args.workspaceHostScope,
      defaultHostId,
      effectiveCollapsedGroups,
      hostDragActive,
      orderedHostOptions,
      rows
    ]
  )
  const otherProjects = useWorkbenchProjectFold(args.workbenchProject, args.worktreeMap)
  useSidebarFoldActions(
    () =>
      addHostSectionRows({
        rows: buildGroupRows(new Set()),
        hostOptions: orderedHostOptions,
        workspaceHostScope: args.workspaceHostScope,
        visibleWorkspaceHostIds: args.visibleWorkspaceHostIds,
        defaultHostId,
        collapsedHostKeys: new Set(),
        preferProjectGrouping: true
      }),
    otherProjects.setExpanded
  )
  const sectionRows = useMemo(
    () =>
      args.workbenchProject
        ? projectWorkbenchRows({
            rows: nativeSectionRows,
            repoId: args.workbenchProject.repoId,
            currentRepoIds: args.workbenchProject.repoIds,
            repos: args.visibleReposForRows,
            projectGroups: args.visibleProjectGroupsForRows,
            worktrees,
            expanded: otherProjects.expanded,
            onToggle: otherProjects.toggle
          })
        : nativeSectionRows,
    [
      nativeSectionRows,
      args.workbenchProject,
      args.visibleReposForRows,
      args.visibleProjectGroupsForRows,
      worktrees,
      otherProjects.expanded,
      otherProjects.toggle
    ]
  )
  const renderedSidebarRowKeys = useMemo(
    () => collectRenderedSidebarRowKeys(args.workbenchProject ? nativeSectionRows : sectionRows),
    [args.workbenchProject, nativeSectionRows, sectionRows]
  )
  return {
    rows,
    sectionRows,
    renderedSidebarRowKeys,
    allRepoIds,
    placeholderRepoIds,
    handleReorderHostSections,
    setHostDragActive
  }
}
