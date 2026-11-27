import type { Worktree } from '../../../../../../shared/worktree/types'
import type { WorktreeLineage } from '../../../../../../shared/worktree/lineage-types'
import { getWorktreeHostIdentity } from '../../../../../../shared/worktree/host-qualified-identity'
import { isPinnedSectionWorktree } from '../../../../../../shared/sidebar-list/lineage/pinned-section-worktrees'
import { normalizeStoredWorkbenchVersionBinding } from '../../../../../../shared/workbench/version-binding'
import { getVersionSidebarProjection } from '@/workbench/version-sidebar-state'
import { resolveSidebarRevealRoute } from './version-tree-reveal-route'

export function getVersionTreeRevealTarget(
  worktree: Worktree,
  worktrees: readonly Worktree[],
  lineage: Readonly<Record<string, WorktreeLineage>>,
  worktreeMap: ReadonlyMap<string, Worktree>
) {
  const { repoId, worktreeIdentities } = getVersionSidebarProjection()
  const worktreeIdentity = getWorktreeHostIdentity(worktree)
  if (!repoId || !worktreeIdentities.has(worktreeIdentity)) {
    return null
  }
  const binding = normalizeStoredWorkbenchVersionBinding(worktree.workbenchVersionBinding)
  if (
    !binding ||
    resolveSidebarRevealRoute({
      worktreeIdentity,
      versionTreeIdentities: worktreeIdentities,
      isPinnedVersionBound: isPinnedSectionWorktree(worktree, worktrees, lineage, worktreeMap)
    }) !== 'version-tree'
  ) {
    return null
  }
  return { repoId, version: binding.version, worktreeIdentity }
}
