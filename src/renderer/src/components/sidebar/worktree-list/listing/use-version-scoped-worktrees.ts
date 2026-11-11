import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'
import { useVersionSidebarProjection } from '@/workbench/version-sidebar-state'
import type { WorktreeLineage } from '../../../../../../shared/worktree/lineage-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { getWorktreeHostIdentity } from '../../../../../../shared/worktree/host-qualified-identity'
import { getPinnedSectionWorktrees } from '../../pinned-section-worktrees'
import { buildWallProjects } from '@/workbench/workbench-wall-projects'
import { getRepoExecutionHostId } from '../../../../../../shared/execution-host'
import type { Repo } from '../../../../../../shared/repo-types'
import { parseWorkspaceKey } from '../../../../../../shared/workspace-scope'
import { getProjectGroupSubtreeIds } from '../../../../../../shared/project-groups'
import { getProjectGroupHostId } from '@/store/slices/project-group-owner-routing'
import { findFolderWorkspaceOwner } from '@/lib/folder-workspace-runtime-owner'
import { getFolderWorkspaceExecutionHostIdForRows } from './host-filtering'
import { selectRepoByIdForActiveWorkspace } from '@/store/selectors'
import { worktreeMatchesHost } from '@/store/slices/worktrees/listing/worktree-host-ownership'

type VersionSidebarScope = {
  worktreeIdentities: ReadonlySet<string>
  rows?: readonly Repo[]
}

type VersionScopedWorktreesArgs = {
  workbenchProject?: VersionSidebarScope
  filteredWorktrees: readonly Worktree[]
  worktreeLineageById: Readonly<Record<string, WorktreeLineage>>
  worktreeMap: ReadonlyMap<string, Worktree>
}

export function useWorkbenchSidebarScope() {
  const activeRepoId = useAppStore((s) => s.activeRepoId)
  const activeWorkspaceKey = useAppStore((s) => s.activeWorkspaceKey ?? s.activeWorktreeId)
  const folders = useAppStore((s) => s.folderWorkspaces)
  const activeHostId = useAppStore((s) => s.activeWorkspaceExecutionHostId)
  const repos = useAppStore((s) => s.repos)
  const groups = useAppStore((s) => s.projectGroups)
  const versionProjection = useVersionSidebarProjection()
  const workbenchProject = useMemo(() => {
    if (!isWorkbenchShell()) {
      return undefined
    }
    const workspace = activeWorkspaceKey ? parseWorkspaceKey(activeWorkspaceKey) : null
    const folder =
      workspace?.type === 'folder'
        ? findFolderWorkspaceOwner(
            { ...useAppStore.getState(), folderWorkspaces: folders, projectGroups: groups },
            workspace.folderWorkspaceId,
            activeHostId ?? undefined
          )
        : null
    const folderHost = folder
      ? (activeHostId ??
        getFolderWorkspaceExecutionHostIdForRows({
          folderWorkspace: folder,
          projectGroup: groups.find((group) => group.id === folder.projectGroupId),
          defaultHostId: 'local'
        }))
      : null
    const folderGroups = folder
      ? groups.filter((group) => getProjectGroupHostId(group) === folderHost)
      : []
    const folderGroupIds = folder
      ? getProjectGroupSubtreeIds(folderGroups, folder.projectGroupId)
      : new Set<string>()
    const repoId = activeRepoId ?? (folder ? null : (repos[0]?.id ?? null))
    const activeRepo = selectRepoByIdForActiveWorkspace(
      { repos, activeRepoId, activeWorkspaceExecutionHostId: activeHostId },
      repoId
    )
    const projectHost = activeRepo ? getRepoExecutionHostId(activeRepo) : activeHostId
    const project = repoId
      ? buildWallProjects(repos, groups).find((item) =>
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
          (row) =>
            row.id === repoId && (!projectHost || getRepoExecutionHostId(row) === projectHost)
        ))
    const projectGroups = groups.filter(
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
      groups: projectGroups,
      worktreeIdentities:
        !folder && versionProjection.repoId === repoId
          ? versionProjection.worktreeIdentities
          : new Set<string>()
    }
  }, [activeRepoId, activeHostId, activeWorkspaceKey, folders, repos, groups, versionProjection])
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
 * Drops the tree set the version sidebar owns from the native project list.
 *
 * Why (#500): BW hides version-bound trees from the project groups, but a
 * pinned one must still reach the Pinned section. `pinnedOnlyIdentities` is the
 * intersection of bound and pinned, so `buildRows` skips exactly those trees in
 * the natural groups while the pinned section keeps rendering them.
 *
 * Why (#603): the Pinned section follows the current project, like the list
 * below it. Other projects' pinned trees leave the sidebar until their project
 * is active; within the current project, every visible host still shows, so a
 * multi-host project keeps its remote pinned rows.
 */
export function scopeWorktreesForVersionSidebar(args: VersionScopedWorktreesArgs): {
  visibleWorktrees: Worktree[]
  pinnedOnlyIdentities?: ReadonlySet<string>
} {
  const { workbenchProject, filteredWorktrees, worktreeLineageById, worktreeMap } = args
  if (!workbenchProject) {
    return { visibleWorktrees: [...filteredWorktrees] }
  }
  const pinnedIdentities = new Set(
    getPinnedSectionWorktrees(
      filteredWorktrees.filter((tree) => inProject(tree, workbenchProject)),
      worktreeLineageById,
      worktreeMap
    ).map(getWorktreeHostIdentity)
  )
  const pinnedOnlyIdentities = new Set(
    filteredWorktrees
      .filter(
        (tree) =>
          pinnedIdentities.has(getWorktreeHostIdentity(tree)) &&
          workbenchProject.worktreeIdentities.has(getWorktreeHostIdentity(tree))
      )
      .map(getWorktreeHostIdentity)
  )
  return {
    visibleWorktrees: filteredWorktrees.filter(
      (tree) =>
        pinnedIdentities.has(getWorktreeHostIdentity(tree)) ||
        (inProject(tree, workbenchProject) &&
          !workbenchProject.worktreeIdentities.has(getWorktreeHostIdentity(tree)))
    ),
    pinnedOnlyIdentities
  }
}

/**
 * The bottom list belongs to the current project; global pinned rows are retained separately.
 */
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
  return (
    !scope.rows ||
    scope.rows.some(
      (row) => row.id === tree.repoId && worktreeMatchesHost(tree, getRepoExecutionHostId(row))
    )
  )
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
