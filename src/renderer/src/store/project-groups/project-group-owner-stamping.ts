import type { ProjectGroup } from '../../../../shared/project-group-types'
import { LOCAL_EXECUTION_HOST_ID, toSshExecutionHostId } from '../../../../shared/execution-host'
import type { RuntimeClientTarget } from '../../runtime/runtime-rpc-client'
import { getRuntimeTargetHostId } from '../runtime-target-host'
import { getRuntimeEnvironmentRevision } from '../../runtime/runtime-environment-revision'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'

export function projectGroupWithFetchedOwner(
  projectGroup: ProjectGroup,
  target: RuntimeClientTarget,
  pairingRevision = target.kind === 'environment'
    ? getRuntimeEnvironmentRevision(target.environmentId)
    : undefined
): ProjectGroup {
  if (target.kind === 'environment') {
    return {
      ...projectGroup,
      executionHostId: getRuntimeTargetHostId(target),
      ...(isWorkbenchShell() && pairingRevision !== undefined
        ? { pairedCatalogRevision: pairingRevision }
        : {})
    }
  }
  if (projectGroup.connectionId) {
    return { ...projectGroup, executionHostId: toSshExecutionHostId(projectGroup.connectionId) }
  }
  return { ...projectGroup, executionHostId: LOCAL_EXECUTION_HOST_ID }
}
