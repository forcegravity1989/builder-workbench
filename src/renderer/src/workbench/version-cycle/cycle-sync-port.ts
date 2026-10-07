import type { MetricScope } from '../../../../shared/workbench/metrics'
import type { CycleSyncResult } from '../../../../shared/workbench/cycle-sync'
import { callMetricRuntime } from '../metric-runtime-rpc'

const pending = new Map<string, Promise<CycleSyncResult>>()

/** Pulls the adopted trunk into the cycle branch on screen entry (owner-routed). */
export function syncCycleTrunk(
  scope: MetricScope,
  runtimeOwnerEnvironmentId?: string
): Promise<CycleSyncResult> {
  const key = JSON.stringify([
    scope.repoId,
    scope.worktreeId,
    scope.hostId,
    runtimeOwnerEnvironmentId
  ])
  const running = pending.get(key)
  if (running) {
    return running
  }
  const request = callMetricRuntime<CycleSyncResult>(
    scope,
    runtimeOwnerEnvironmentId,
    'workbench.cycle.syncTrunk',
    (ownerScope) => ({ scope: ownerScope }),
    // The main-side pull bounds itself at 60s; the RPC budget adds headroom.
    90_000
  )
  pending.set(key, request)
  const release = () => {
    pending.delete(key)
  }
  void request.then(release, release)
  return request
}
