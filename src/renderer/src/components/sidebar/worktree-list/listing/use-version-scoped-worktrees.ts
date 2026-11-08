import { useMemo } from 'react'
import type { WorktreeLineage } from '../../../../../../shared/worktree/lineage-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { getWorktreeHostIdentity } from '../../../../../../shared/worktree/host-qualified-identity'
import { getPinnedSectionWorktrees } from '../../pinned-section-worktrees'

type VersionSidebarScope = {
  worktreeIdentities: ReadonlySet<string>
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
  const pinnedIdentities = new Set(
    getPinnedSectionWorktrees(filteredWorktrees, worktreeLineageById, worktreeMap).map(
      getWorktreeHostIdentity
    )
  )
  const pinnedOnlyIdentities = new Set(
    [...pinnedIdentities].filter((identity) => workbenchProject.worktreeIdentities.has(identity))
  )
  return {
    visibleWorktrees: filteredWorktrees.filter(
      (tree) =>
        pinnedIdentities.has(getWorktreeHostIdentity(tree)) ||
        !workbenchProject.worktreeIdentities.has(getWorktreeHostIdentity(tree))
    ),
    pinnedOnlyIdentities
  }
}

/**
 * Only the current version directory's trees are deduplicated; other projects stay native.
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
