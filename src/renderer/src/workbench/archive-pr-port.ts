import type { ArchivePrStatusResult } from '../../../shared/workbench/archive-pr-status'
import type { WorkflowArchivePr } from '../../../shared/workbench/version-workflow'
import type { ArchivePrPort, ArchivePrScope } from './version-cycle/ports'
import { callMetricRuntime } from './metric-runtime-rpc'

/**
 * Archive PR status from the model-recorded reference only, read on the
 * worktree's owning runtime — never the current focus, no byte proof and no
 * branch-name guessing. Provider facts stay provider-reported; anything
 * unreadable stays unknown instead of feigning a state.
 */
export function nativeArchivePrPort(runtimeOwnerEnvironmentId?: string): ArchivePrPort {
  return {
    async readStatus(
      scope: ArchivePrScope,
      pr: WorkflowArchivePr,
      force?: boolean
    ): Promise<ArchivePrStatusResult> {
      const owner = scope.runtimeOwnerEnvironmentId ?? runtimeOwnerEnvironmentId
      return callMetricRuntime<ArchivePrStatusResult>(
        { repoId: scope.repoId, worktreeId: scope.worktreeId, hostId: scope.hostId },
        owner,
        'workbench.archive.prStatus',
        (ownerScope) => ({ ...ownerScope, pr, ...(force ? { force } : {}) }),
        30_000
      )
    }
  }
}
