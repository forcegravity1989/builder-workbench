import type { SidebarListModel, SidebarListModelArgs } from './sidebar-list-model'
import { useSidebarExternalWorktreeCards } from './use-external-worktree-cards'
import { useSidebarHostVisibleScope } from './use-host-visible-scope'
import { useSidebarSectionRows } from './use-section-rows'
import { useSidebarWorktreeSortOrder } from './use-sort-order'
import { useOrderHeldWhileEngaged } from './use-order-hold'
import { useVisibleSidebarWorktrees } from './use-visible-worktrees'
import {
  scopeDetectedWorktreesForVersionSidebar,
  scopeProjectsForVersionSidebar,
  useVersionScopedWorktrees,
  useWorkbenchSidebarScope
} from './use-version-scoped-worktrees'
import { useMemo } from 'react'

export function useWindowSidebarListModel(args: SidebarListModelArgs): SidebarListModel {
  const { filterState, sortBy, repoMap, repos, defaultHostId } = args
  const sortedIds = useOrderHeldWhileEngaged(
    useSidebarWorktreeSortOrder({ repoMap, sortBy }),
    sortBy
  )
  const {
    visibleWorktrees: filteredWorktrees,
    pairedDeviceIdsByEnvironment,
    botListedWorktreeIdentities
  } = useVisibleSidebarWorktrees({
    filterState,
    sortBy,
    sortedIds,
    repoMap,
    worktreeLineageById: args.worktreeLineageById,
    defaultHostId,
    agentSendTargetWorktreeId: args.agentSendTargetWorktreeId
  })
  const { workbenchProject, workbenchScope } = useWorkbenchSidebarScope()
  const { visibleWorktrees, pinnedOnlyIdentities } = useVersionScopedWorktrees({
    workbenchProject,
    filteredWorktrees,
    worktreeLineageById: args.worktreeLineageById,
    worktreeMap: args.worktreeMap
  })
  const hostScope = useSidebarHostVisibleScope({
    filterState,
    defaultHostId,
    repos,
    projectGroups: args.projectGroups,
    folderWorkspaces: args.folderWorkspaces,
    pairedDeviceIdsByEnvironment,
    botListedWorktreeIdentities
  })
  const visibleScope = useMemo(
    () => scopeProjectsForVersionSidebar(hostScope, workbenchProject),
    [
      hostScope.visibleReposForRows,
      hostScope.visibleProjectGroupsForRows,
      hostScope.visibleFolderWorkspacesForRows,
      workbenchProject
    ]
  )
  const detectedWorktreesByRepo = useMemo(
    () => scopeDetectedWorktreesForVersionSidebar(args.detectedWorktreesByRepo, workbenchProject),
    [args.detectedWorktreesByRepo, workbenchProject]
  )
  const externalWorktreeCards = useSidebarExternalWorktreeCards({
    repos,
    visibleReposForRows: visibleScope.visibleReposForRows,
    detectedWorktreesByRepo,
    filterRepoIds: filterState.filterRepoIds
  })
  const rowModel = useSidebarSectionRows({
    workbenchRepoIds: workbenchScope?.repoIds,
    pinnedOnlyIdentities,
    groupBy: args.groupBy,
    sortBy: args.sortBy,
    projectOrderBy: args.projectOrderBy,
    pinnedDisplayPolicy: args.pinnedDisplayPolicy,
    defaultHostId,
    worktrees: visibleWorktrees,
    repos,
    repoMap,
    worktreeMap: args.worktreeMap,
    worktreeLineageById: args.worktreeLineageById,
    prCache: args.prCache,
    settings: args.settings,
    workspaceStatuses: args.workspaceStatuses,
    effectiveCollapsedGroups: args.collapsedGroups,
    agentSendTargetWorktreeId: args.agentSendTargetWorktreeId,
    projectGrouping: args.projectGrouping,
    visibleReposForRows: visibleScope.visibleReposForRows,
    visibleProjectGroupsForRows: visibleScope.visibleProjectGroupsForRows,
    visibleFolderWorkspacesForRows: visibleScope.visibleFolderWorkspacesForRows,
    importedWorktreesByRepo: externalWorktreeCards.importedWorktreesByRepo,
    newExternalWorktreesInboxByRepo: externalWorktreeCards.newExternalWorktreesInboxByRepo,
    filterRepoIds: filterState.filterRepoIds,
    visibleWorkspaceHostIds: filterState.visibleWorkspaceHostIds,
    workspaceHostScope: filterState.workspaceHostScope
  })
  return {
    visibleWorktrees,
    versionWorktrees: filteredWorktrees,
    visibleScope,
    externalWorktreeCards,
    rowModel
  }
}
