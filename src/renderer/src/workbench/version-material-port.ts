import { createVersionMaterialPort } from '../../../shared/workbench/version-material-client'
import { normalizeExecutionHostId, parseExecutionHostId } from '../../../shared/execution-host'
import type {
  VersionMaterialScope,
  VersionMaterialResult
} from '../../../shared/workbench/version-material-request'
import { callHostRoute } from '../runtime/host-route-call'
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
  const owner = parseExecutionHostId(hostId)!
  const ownerScope = {
    ...scope,
    hostId: owner.kind === 'runtime' ? ('local' as const) : owner.id
  }
  return createVersionMaterialPort(ownerScope, ({ method, params }) =>
    callHostRoute<VersionMaterialResult<unknown>>({ target, at: ownerScope.hostId }, method, params)
  )
}
