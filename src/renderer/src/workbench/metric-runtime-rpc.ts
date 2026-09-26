import { normalizeExecutionHostId, parseExecutionHostId } from '../../../shared/execution-host'
import type { MetricScope } from '../../../shared/workbench/metrics'
import type { VersionMaterialResult } from '../../../shared/workbench/version-material-request'
import { routeForOwner } from '../lib/worktree-owner-route'
import { callRuntimeRpc, type RuntimeClientTarget } from '../runtime/runtime-rpc-client'

export class MetricRuntimeError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'MetricRuntimeError'
  }
}

/** The native owning runtime resolves registered IDs and enforces filesystem authority. */
export async function callMetricRuntime<T>(
  scope: MetricScope,
  runtimeOwnerEnvironmentId: string | undefined,
  method: string,
  params: (ownerScope: MetricScope) => unknown,
  timeoutMs?: number
): Promise<T> {
  const { target, ownerScope } = metricRuntimeRoute(scope, runtimeOwnerEnvironmentId)
  const result = await callRuntimeRpc<VersionMaterialResult<T>>(
    target,
    method,
    params(ownerScope),
    timeoutMs === undefined ? undefined : { timeoutMs }
  )
  if (!result.ok) {
    throw new MetricRuntimeError(result.error.code, result.error.message)
  }
  return result.value
}

/**
 * Owner routing shared by every BW runtime call: paired runtimes answer through
 * their environment, and a runtime-kind host id reads as local on its owner.
 */
export function metricRuntimeRoute(
  scope: MetricScope,
  runtimeOwnerEnvironmentId: string | undefined
): { target: RuntimeClientTarget; ownerScope: MetricScope } {
  const hostId = normalizeExecutionHostId(scope.hostId)
  if (!hostId) {
    throw new MetricRuntimeError('invalid-scope', '无法识别工作树所属宿主')
  }
  const route = routeForOwner({ hostId, runtimeOwnerEnvironmentId })!
  const target = route.runtimeEnvironmentId
    ? { kind: 'environment' as const, environmentId: route.runtimeEnvironmentId }
    : { kind: 'local' as const }
  const ownerScope = {
    ...scope,
    hostId: parseExecutionHostId(hostId)?.kind === 'runtime' ? 'local' : hostId
  }
  return { target, ownerScope }
}
