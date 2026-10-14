import type { MetricScope } from '../../../../shared/workbench/metrics'
import type { TrunkUpdateResult } from '../../../../shared/workbench/trunk-update'
import { callMetricRuntime } from '../metric-runtime-rpc'

const pending = new Map<string, Promise<TrunkUpdateResult>>()

/**
 * The one code-sync entry: a screen's「更新代码」button (owner-routed). Nothing
 * calls this on screen entry — entering a board never touches Git.
 */
export function updateTrunkCode(
  scope: MetricScope,
  runtimeOwnerEnvironmentId?: string
): Promise<TrunkUpdateResult> {
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
  const request = callMetricRuntime<TrunkUpdateResult>(
    scope,
    runtimeOwnerEnvironmentId,
    'workbench.trunk.update',
    (ownerScope) => ({ scope: ownerScope }),
    // The main-side sync bounds itself at 60s; the RPC budget adds headroom.
    90_000
  )
  pending.set(key, request)
  const release = () => {
    if (pending.get(key) === request) {
      pending.delete(key)
    }
  }
  void request.then(release, release)
  return request
}

/** One toast sentence straight from the result; refusals already carry the unified wording. */
export function trunkUpdateNotice(result: TrunkUpdateResult): string {
  if (result.updated) {
    if (result.pulled > 0) {
      const head = result.commit ? ` @ ${result.commit.slice(0, 12)}` : ''
      return `已更新到 ${result.ref ?? '主干'}${head}（拉入 ${result.pulled} 个提交）`
    }
    return '已是最新'
  }
  return result.reason ?? '代码未更新，原因未知'
}
