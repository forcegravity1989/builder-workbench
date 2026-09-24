import { createVersionMaterialPort } from '../../../shared/workbench/version-material-client'
import { normalizeExecutionHostId, parseExecutionHostId } from '../../../shared/execution-host'
import type {
  VersionMaterialScope,
  VersionMaterialResult
} from '../../../shared/workbench/version-material-request'
import { callRuntimeRpc } from '../runtime/runtime-rpc-client'
import { routeForOwner } from '../lib/worktree-owner-route'

/** The selected native worktree supplies both its filesystem host and optional paired runtime. */
export function nativeVersionMaterialPort(
  scope: VersionMaterialScope,
  runtimeOwnerEnvironmentId?: string
) {
  const hostId = normalizeExecutionHostId(scope.hostId)
  if (!hostId) {
    throw new Error('Invalid worktree execution host')
  }
  const route = routeForOwner({ hostId, runtimeOwnerEnvironmentId })!
  const target = route.runtimeEnvironmentId
    ? { kind: 'environment' as const, environmentId: route.runtimeEnvironmentId }
    : { kind: 'local' as const }
  const ownerScope = {
    ...scope,
    hostId: parseExecutionHostId(hostId)?.kind === 'runtime' ? 'local' : hostId
  }
  return createVersionMaterialPort(ownerScope, ({ method, params }) =>
    callRuntimeRpc<VersionMaterialResult<unknown>>(target, method, params)
  )
}
