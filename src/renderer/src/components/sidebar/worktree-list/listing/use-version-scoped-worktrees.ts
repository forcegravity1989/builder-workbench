import { useMemo } from 'react'
import type { WorktreeLineage } from '../../../../../../shared/worktree/lineage-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { getWorktreeHostIdentity } from '../../../../../../shared/worktree/host-qualified-identity'
import { getPinnedSectionWorktrees } from '../../pinned-section-worktrees'

/**
 * Drops the tree set the version sidebar owns from the native project list.
 *
 * Why (#500): BW hides version-bound trees from the project groups, but a
 * pinned one must still reach the Pinned section. The returned list keeps the
 * pinned set and `pinnedOnlyIdentities` tells buildRows to skip them in the
 * natural groups only.
 */
export function useVersionScopedWorktrees(args: {
  workbenchProject?: { worktreeIdentities: ReadonlySet<string> }
  filteredWorktrees: Worktree[]
  worktreeLineageById: Readonly<Record<string, WorktreeLineage>>
  worktreeMap: ReadonlyMap<string, Worktree>
}): { visibleWorktrees: Worktree[]; pinnedOnlyIdentities?: ReadonlySet<string> } {
  const { workbenchProject, filteredWorktrees, worktreeLineageById, worktreeMap } = args
  const visibleWorktrees = useMemo(() => {
    if (!workbenchProject) {
      return filteredWorktrees
    }
    const pinnedIdentities = new Set(
      getPinnedSectionWorktrees(filteredWorktrees, worktreeLineageById, worktreeMap).map(
        getWorktreeHostIdentity
      )
    )
    return filteredWorktrees.filter(
      (tree) =>
        pinnedIdentities.has(getWorktreeHostIdentity(tree)) ||
        !workbenchProject.worktreeIdentities.has(getWorktreeHostIdentity(tree))
    )
  }, [filteredWorktrees, workbenchProject, worktreeLineageById, worktreeMap])
  return { visibleWorktrees, pinnedOnlyIdentities: workbenchProject?.worktreeIdentities }
}
