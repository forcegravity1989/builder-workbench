import type { ReleaseStatusResult } from '../../../shared/workbench/release-status'
import type { WorkflowReleaseRef } from '../../../shared/workbench/version-workflow'
import type { ArchivePrScope, ReleaseStatusPort } from './version-cycle/ports'
import { callMetricRuntime } from './metric-runtime-rpc'

/**
 * Release status from the model-recorded tag reference only, read on the
 * worktree's owning runtime — one provider read, no tag-list probing. The tag
 * and the provider Release page stay the source of truth; anything unreadable
 * stays unknown instead of feigning a state (#462).
 */
export function nativeReleaseStatusPort(runtimeOwnerEnvironmentId?: string): ReleaseStatusPort {
  return {
    async readStatus(
      scope: ArchivePrScope,
      release: WorkflowReleaseRef
    ): Promise<ReleaseStatusResult> {
      const owner = scope.runtimeOwnerEnvironmentId ?? runtimeOwnerEnvironmentId
      return callMetricRuntime<ReleaseStatusResult>(
        { repoId: scope.repoId, worktreeId: scope.worktreeId, hostId: scope.hostId },
        owner,
        'workbench.release.status',
        (ownerScope) => ({ ...ownerScope, release }),
        30_000
      )
    }
  }
}
