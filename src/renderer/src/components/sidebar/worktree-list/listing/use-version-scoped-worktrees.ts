import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { useShallow } from 'zustand/react/shallow'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'
import {
  useVersionSidebarProjection,
  type VersionSidebarProjection
} from '@/workbench/version-sidebar-state'
import type { AppState } from '@/store/types'
import type { WorktreeLineage } from '../../../../../../shared/worktree/lineage-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { getWorktreeHostIdentity } from '../../../../../../shared/worktree/host-qualified-identity'
import { getPinnedSectionWorktrees } from '../../../../../../shared/sidebar-list/lineage/pinned-section-worktrees'
import { buildWallProjects } from '@/workbench/workbench-wall-projects'
import { getRepoExecutionHostId } from '../../../../../../shared/execution-host/execution-host'
import type { Repo } from '../../../../../../shared/repository/repo-types'
import type { FolderWorkspace } from '../../../../../../shared/folder-workspaces/folder-workspace-types'
import type { ProjectGroup } from '../../../../../../shared/project/groups/project-group-types'
import { parseWorkspaceKey } from '../../../../../../shared/workspace/identity/workspace-scope'
import { getProjectGroupSubtreeIds } from '../../../../../../shared/project/groups/project-groups'
import { findFolderWorkspaceOwner } from '@/lib/workspace/ownership/folder-workspace-runtime-owner'
import {
  getFolderWorkspaceExecutionHostIdForRows,
  getProjectGroupExecutionHostIdForRows
} from '../../../../../../shared/sidebar-list/hosts/host-filtering'
import { selectRepoByIdForActiveWorkspace } from '@/store/repos/active-workspace-repository'
import { worktreeMatchesHost } from '@/store/slices/worktrees/listing/worktree-host-ownership'
import {
  isWorkbenchBotWorkspace,
  workbenchSidebarProjectRepo,
  type SidebarProjectState
} from '@/workbench/project-source-resolution'

type VersionSidebarScope = {
  worktreeIdentities: ReadonlySet<string>
  rows: readonly Repo[]
}

function getProjectGroupHostId(group: ProjectGroup) {
  return getProjectGroupExecutionHostIdForRows(group, 'local')
}

type VersionScopedWorktreesArgs = {
  workbenchProject?: VersionSidebarScope
  filteredWorktrees: readonly Worktree[]
  worktreeLineageById: Readonly<Record<string, WorktreeLineage>>
  worktreeMap: ReadonlyMap<string, Worktree>
}

export function getWorkbenchSidebarProject(
  state: SidebarProjectState &
    Pick<AppState, 'activeWorktreeId' | 'folderWorkspaces' | 'projectGroups'>,
  versionProjection: VersionSidebarProjection
) {
  if (!isWorkbenchShell()) {
    return undefined
  }
  const { activeWorkspaceExecutionHostId: activeHostId, repos, projectGroups } = state
  const activeWorkspaceKey = state.activeWorkspaceKey ?? state.activeWorktreeId
  const botWorkspace = isWorkbenchBotWorkspace(activeWorkspaceKey)
  const workspace = activeWorkspaceKey ? parseWorkspaceKey(activeWorkspaceKey) : null
  const folder =
    workspace?.type === 'folder' && !botWorkspace
      ? findFolderWorkspaceOwner(state, workspace.folderWorkspaceId, activeHostId ?? undefined)
      : null
  const folderHost = folder
    ? (activeHostId ??
      getFolderWorkspaceExecutionHostIdForRows({
        folderWorkspace: folder,
        projectGroup: projectGroups.find((group) => group.id === folder.projectGroupId),
        defaultHostId: 'local'
      }))
    : null
  const folderGroups = folder
    ? projectGroups.filter((group) => getProjectGroupHostId(group) === folderHost)
    : []
  const folderGroupIds = folder
    ? getProjectGroupSubtreeIds(folderGroups, folder.projectGroupId)
    : new Set<string>()
  const activeRepo = botWorkspace
    ? workbenchSidebarProjectRepo(state)
    : selectRepoByIdForActiveWorkspace(
        state,
        state.activeRepoId ?? (folder ? null : (repos[0]?.id ?? null))
      )
  const repoId = activeRepo?.id ?? null
  if (!activeRepo && !folder) {
    return undefined
  }
  const projectHost = activeRepo ? getRepoExecutionHostId(activeRepo) : activeHostId
  const project = repoId
    ? buildWallProjects(repos, projectGroups).find((item) =>
        item.rows.some(
          (row) =>
            row.id === repoId && (!projectHost || getRepoExecutionHostId(row) === projectHost)
        )
      )
    : undefined
  const rows = folder
    ? repos.filter(
        (row) =>
          getRepoExecutionHostId(row) === folderHost &&
          !!row.projectGroupId &&
          folderGroupIds.has(row.projectGroupId)
      )
    : (project?.rows ??
      repos.filter(
        (row) => row.id === repoId && (!projectHost || getRepoExecutionHostId(row) === projectHost)
      ))
  const groups = projectGroups.filter(
    (group) =>
      (folder && getProjectGroupHostId(group) === folderHost && folderGroupIds.has(group.id)) ||
      rows.some(
        (row) =>
          row.projectGroupId === group.id &&
          getRepoExecutionHostId(row) === getProjectGroupHostId(group)
      )
  )
  return {
    repoId: repoId ?? '',
    repoIds: rows.map((row) => row.id),
    rows,
    groups,
    worktreeIdentities:
      !folder && rows.some((row) => row.id === versionProjection.repoId)
        ? versionProjection.worktreeIdentities
        : new Set<string>()
  }
}

export function useWorkbenchSidebarScope() {
  const state = useAppStore(
    useShallow((s) => ({
      activeRepoId: s.activeRepoId,
      activeWorkspaceKey: s.activeWorkspaceKey,
      activeWorktreeId: s.activeWorktreeId,
      activeWorkspaceExecutionHostId: s.activeWorkspaceExecutionHostId,
      folderWorkspaces: s.folderWorkspaces,
      worktreeNavHistory: s.worktreeNavHistory,
      worktreeNavHistoryIndex: s.worktreeNavHistoryIndex,
      worktreesByRepo: s.worktreesByRepo,
      repos: s.repos,
      projectGroups: s.projectGroups
    }))
  )
  const versionProjection = useVersionSidebarProjection()
  const workbenchProject = useMemo(
    () => getWorkbenchSidebarProject(state, versionProjection),
    [state, versionProjection]
  )
  const workbenchScope = useMemo(
    () =>
      workbenchProject
        ? { repoId: workbenchProject.repoId, repoIds: workbenchProject.repoIds }
        : undefined,
    [workbenchProject]
  )
  return { workbenchProject, workbenchScope }
}

/**
 * Version-bound trees can still reach Pinned, but cannot also render in the native project groups.
 */
export function scopeWorktreesForVersionSidebar(args: VersionScopedWorktreesArgs): {
  visibleWorktrees: Worktree[]
  pinnedOnlyIdentities?: ReadonlySet<string>
} {
  const { workbenchProject, filteredWorktrees, worktreeLineageById, worktreeMap } = args
  if (!workbenchProject) {
    return { visibleWorktrees: [...filteredWorktrees] }
  }
  const projectWorktrees = filteredWorktrees.filter((tree) => inProject(tree, workbenchProject))
  const pinnedIdentities = new Set(
    getPinnedSectionWorktrees(projectWorktrees, worktreeLineageById, worktreeMap).map(
      getWorktreeHostIdentity
    )
  )
  return {
    visibleWorktrees: projectWorktrees.filter((tree) => {
      const identity = getWorktreeHostIdentity(tree)
      return pinnedIdentities.has(identity) || !workbenchProject.worktreeIdentities.has(identity)
    }),
    pinnedOnlyIdentities: new Set(
      [...pinnedIdentities].filter((identity) => workbenchProject.worktreeIdentities.has(identity))
    )
  }
}

export function scopeDetectedWorktreesForVersionSidebar<
  T extends { worktrees: readonly Worktree[] }
>(byRepo: Record<string, T>, workbenchProject?: VersionSidebarScope): Record<string, T> {
  if (!workbenchProject) {
    return byRepo
  }
  return Object.fromEntries(
    Object.entries(byRepo).map(([id, detected]) => [
      id,
      {
        ...detected,
        worktrees: detected.worktrees.filter(
          (tree) =>
            inProject(tree, workbenchProject) &&
            !workbenchProject.worktreeIdentities.has(getWorktreeHostIdentity(tree))
        )
      }
    ])
  )
}

function inProject(tree: Worktree, scope: VersionSidebarScope): boolean {
  return scope.rows.some(
    (row) => row.id === tree.repoId && worktreeMatchesHost(tree, getRepoExecutionHostId(row))
  )
}

export function scopeFolderWorkspacesForVersionSidebar(
  folders: readonly FolderWorkspace[],
  groups?: readonly ProjectGroup[]
): readonly FolderWorkspace[] {
  return groups
    ? folders.filter((folder) =>
        groups.some(
          (group) =>
            group.id === folder.projectGroupId &&
            getProjectGroupHostId(group) ===
              getFolderWorkspaceExecutionHostIdForRows({
                folderWorkspace: folder,
                projectGroup: group,
                defaultHostId: 'local'
              })
        )
      )
    : folders
}

export function scopeProjectsForVersionSidebar(
  visible: {
    visibleReposForRows: readonly Repo[]
    visibleProjectGroupsForRows: readonly ProjectGroup[]
    visibleFolderWorkspacesForRows: readonly FolderWorkspace[]
  },
  project: ReturnType<typeof getWorkbenchSidebarProject>
): typeof visible {
  if (!project) {
    return visible
  }
  return {
    visibleReposForRows: visible.visibleReposForRows.filter((repo) =>
      project.rows.some(
        (row) => row.id === repo.id && getRepoExecutionHostId(row) === getRepoExecutionHostId(repo)
      )
    ),
    visibleProjectGroupsForRows: visible.visibleProjectGroupsForRows.filter((group) =>
      project.groups.some(
        (row) => row.id === group.id && getProjectGroupHostId(row) === getProjectGroupHostId(group)
      )
    ),
    visibleFolderWorkspacesForRows: scopeFolderWorkspacesForVersionSidebar(
      visible.visibleFolderWorkspacesForRows,
      project.groups
    )
  }
}

export function useVersionScopedWorktrees(args: VersionScopedWorktreesArgs): {
  visibleWorktrees: Worktree[]
  pinnedOnlyIdentities?: ReadonlySet<string>
} {
  const { workbenchProject, filteredWorktrees, worktreeLineageById, worktreeMap } = args
  return useMemo(
    () =>
      scopeWorktreesForVersionSidebar({
        workbenchProject,
        filteredWorktrees,
        worktreeLineageById,
        worktreeMap
      }),
    [filteredWorktrees, workbenchProject, worktreeLineageById, worktreeMap]
  )
}
