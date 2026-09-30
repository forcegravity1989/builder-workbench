import type { MetricScope } from '../../../../shared/workbench/metrics'
import type { CycleSyncResult } from '../../../../shared/workbench/cycle-sync'
import { callMetricRuntime } from './metric-runtime-rpc'

/** Pulls the adopted trunk into the cycle branch on screen entry (owner-routed). */
export function syncCycleTrunk(
  scope: MetricScope,
  runtimeOwnerEnvironmentId?: string
): Promise<CycleSyncResult> {
  return callMetricRuntime<CycleSyncResult>(
    scope,
    runtimeOwnerEnvironmentId,
    'workbench.cycle.syncTrunk',
    (ownerScope) => ({ scope: ownerScope }),
    // The main-side pull bounds itself at 60s; the RPC budget adds headroom.
    90_000
  )
}
