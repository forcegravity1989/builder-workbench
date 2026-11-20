import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { useShallow } from 'zustand/react/shallow'
import { isMonicaShell } from '@/monica/is-monica-shell'
import {
  useVersionSidebarProjection,
  type VersionSidebarProjection
} from '@/monica/version-sidebar-state'
import type { AppState } from '@/store/types'
import type { WorktreeLineage } from '../../../../../../shared/worktree/lineage-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { getWorktreeHostIdentity } from '../../../../../../shared/worktree/host-qualified-identity'
import { getPinnedSectionWorktrees } from '../../pinned-section-worktrees'
import { buildWallProjects } from '@/monica/monica-wall-projects'
import { getRepoExecutionHostId } from '../../../../../../shared/execution-host'
import type { Repo } from '../../../../../../shared/repo-types'
import type { FolderWorkspace } from '../../../../../../shared/folder-workspace-types'
import type { ProjectGroup } from '../../../../../../shared/project-group-types'
import { parseWorkspaceKey } from '../../../../../../shared/workspace-scope'
import { getProjectGroupSubtreeIds } from '../../../../../../shared/project-groups'
import { getProjectGroupHostId } from '@/store/slices/project-group-owner-routing'
import { findFolderWorkspaceOwner } from '@/lib/folder-workspace-runtime-owner'
import { getFolderWorkspaceExecutionHostIdForRows } from './host-filtering'
import { selectRepoByIdForActiveWorkspace } from '@/store/selectors'
import { worktreeMatchesHost } from '@/store/slices/worktrees/listing/worktree-host-ownership'

type VersionSidebarScope = {
  worktreeIdentities: ReadonlySet<string>
  rows: readonly Repo[]
}

type VersionScopedWorktreesArgs = {
  monicaProject?: VersionSidebarScope
  filteredWorktrees: readonly Worktree[]
  worktreeLineageById: Readonly<Record<string, WorktreeLineage>>
  worktreeMap: ReadonlyMap<string, Worktree>
}

export function getMonicaSidebarProject(
  state: Pick<
    AppState,
    | 'activeRepoId'
    | 'activeWorkspaceKey'
    | 'activeWorktreeId'
    | 'activeWorkspaceExecutionHostId'
    | 'folderWorkspaces'
    | 'repos'
    | 'projectGroups'
  >,
  versionProjection: VersionSidebarProjection
) {
  if (!isMonicaShell()) {
    return undefined
  }
  const { activeRepoId, activeWorkspaceExecutionHostId: activeHostId, repos, projectGroups } = state
  const activeWorkspaceKey = state.activeWorkspaceKey ?? state.activeWorktreeId
  const workspace = activeWorkspaceKey ? parseWorkspaceKey(activeWorkspaceKey) : null
  const folder =
    workspace?.type === 'folder'
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
  const repoId = activeRepoId ?? (folder ? null : (repos[0]?.id ?? null))
  const activeRepo = selectRepoByIdForActiveWorkspace(state, repoId)
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
    worktreeIdentities: !folder ? versionProjection.worktreeIdentities : new Set<string>()
  }
}

export function useMonicaSidebarScope() {
  const state = useAppStore(
    useShallow((s) => ({
      activeRepoId: s.activeRepoId,
      activeWorkspaceKey: s.activeWorkspaceKey,
      activeWorktreeId: s.activeWorktreeId,
      activeWorkspaceExecutionHostId: s.activeWorkspaceExecutionHostId,
      folderWorkspaces: s.folderWorkspaces,
      repos: s.repos,
      projectGroups: s.projectGroups
    }))
  )
  const versionProjection = useVersionSidebarProjection()
  const monicaProject = useMemo(
    () => getMonicaSidebarProject(state, versionProjection),
    [state, versionProjection]
  )
  const monicaScope = useMemo(
    () =>
      monicaProject ? { repoId: monicaProject.repoId, repoIds: monicaProject.repoIds } : undefined,
    [monicaProject]
  )
  return { monicaProject, monicaScope }
}

/**
 * Version-bound trees can still reach Pinned, but cannot also render in the native project groups.
 */
export function scopeWorktreesForVersionSidebar(args: VersionScopedWorktreesArgs): {
  visibleWorktrees: Worktree[]
  pinnedOnlyIdentities?: ReadonlySet<string>
} {
  const { monicaProject, filteredWorktrees, worktreeLineageById, worktreeMap } = args
  if (!monicaProject) {
    return { visibleWorktrees: [...filteredWorktrees] }
  }
  const projectWorktrees = filteredWorktrees.filter((tree) => inProject(tree, monicaProject))
  const pinnedIdentities = new Set(
    getPinnedSectionWorktrees(projectWorktrees, worktreeLineageById, worktreeMap).map(
      getWorktreeHostIdentity
    )
  )
  return {
    visibleWorktrees: projectWorktrees.filter((tree) => {
      const identity = getWorktreeHostIdentity(tree)
      return pinnedIdentities.has(identity) || !monicaProject.worktreeIdentities.has(identity)
    }),
    pinnedOnlyIdentities: new Set(
      [...pinnedIdentities].filter((identity) => monicaProject.worktreeIdentities.has(identity))
    )
  }
}

export function scopeDetectedWorktreesForVersionSidebar<
  T extends { worktrees: readonly Worktree[] }
>(byRepo: Record<string, T>, monicaProject?: VersionSidebarScope): Record<string, T> {
  if (!monicaProject) {
    return byRepo
  }
  return Object.fromEntries(
    Object.entries(byRepo).map(([id, detected]) => [
      id,
      {
        ...detected,
        worktrees: detected.worktrees.filter(
          (tree) =>
            inProject(tree, monicaProject) &&
            !monicaProject.worktreeIdentities.has(getWorktreeHostIdentity(tree))
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

export function useVersionScopedWorktrees(args: VersionScopedWorktreesArgs): {
  visibleWorktrees: Worktree[]
  pinnedOnlyIdentities?: ReadonlySet<string>
} {
  const { monicaProject, filteredWorktrees, worktreeLineageById, worktreeMap } = args
  return useMemo(
    () =>
      scopeWorktreesForVersionSidebar({
        monicaProject,
        filteredWorktrees,
        worktreeLineageById,
        worktreeMap
      }),
    [filteredWorktrees, monicaProject, worktreeLineageById, worktreeMap]
  )
}
