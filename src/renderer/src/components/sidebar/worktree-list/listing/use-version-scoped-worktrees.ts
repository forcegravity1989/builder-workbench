import { useMemo } from 'react'
import type { WorktreeLineage } from '../../../../../../shared/worktree/lineage-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { getWorktreeHostIdentity } from '../../../../../../shared/worktree/host-qualified-identity'
import { getPinnedSectionWorktrees } from '../../pinned-section-worktrees'

type VersionSidebarScope = {
  worktreeIdentities: ReadonlySet<string>
  /** Current project's repos; the second column no longer lists 其他项目 (#475). */
  repoIds?: readonly string[]
}

type VersionScopedWorktreesArgs = {
  workbenchProject?: VersionSidebarScope
  filteredWorktrees: readonly Worktree[]
  worktreeLineageById: Readonly<Record<string, WorktreeLineage>>
  worktreeMap: ReadonlyMap<string, Worktree>
}

/**
 * Drops the tree set the version sidebar owns from the native project list.
 *
 * Why (#500): BW hides version-bound trees from the project groups, but a
 * pinned one must still reach the Pinned section. `pinnedOnlyIdentities` is the
 * intersection of bound and pinned, so `buildRows` skips exactly those trees in
 * the natural groups while the pinned section keeps rendering them.
 */
export function scopeWorktreesForVersionSidebar(args: VersionScopedWorktreesArgs): {
  visibleWorktrees: Worktree[]
  pinnedOnlyIdentities?: ReadonlySet<string>
} {
  const { workbenchProject, filteredWorktrees, worktreeLineageById, worktreeMap } = args
  if (!workbenchProject) {
    return { visibleWorktrees: [...filteredWorktrees] }
  }
  const projectRepoIds =
    workbenchProject.repoIds && workbenchProject.repoIds.length > 0
      ? new Set(workbenchProject.repoIds)
      : null
  const inProject = projectRepoIds
    ? filteredWorktrees.filter((tree) => projectRepoIds.has(tree.repoId))
    : [...filteredWorktrees]
  const pinnedIdentities = new Set(
    getPinnedSectionWorktrees(inProject, worktreeLineageById, worktreeMap).map(
      getWorktreeHostIdentity
    )
  )
  const pinnedOnlyIdentities = new Set(
    [...pinnedIdentities].filter((identity) => workbenchProject.worktreeIdentities.has(identity))
  )
  return {
    visibleWorktrees: inProject.filter(
      (tree) =>
        pinnedIdentities.has(getWorktreeHostIdentity(tree)) ||
        !workbenchProject.worktreeIdentities.has(getWorktreeHostIdentity(tree))
    ),
    pinnedOnlyIdentities
  }
}

/**
 * Keeps external detected trees of the current project only (other repos have no
 * section in the second column any more) and drops version-bound ones, which the
 * version block owns.
 */
export function scopeDetectedWorktreesToProject<T extends { worktrees: readonly Worktree[] }>(
  byRepo: Record<string, T>,
  workbenchProject?: VersionSidebarScope
): Record<string, T> {
  if (!workbenchProject) {
    return byRepo
  }
  const repoIds =
    workbenchProject.repoIds && workbenchProject.repoIds.length > 0
      ? new Set(workbenchProject.repoIds)
      : null
  return Object.fromEntries(
    Object.entries(byRepo)
      .filter(([id]) => !repoIds || repoIds.has(id))
      .map(([id, detected]) => [
        id,
        {
          ...detected,
          worktrees: detected.worktrees.filter(
            (tree) => !workbenchProject.worktreeIdentities.has(getWorktreeHostIdentity(tree))
          )
        }
      ])
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
