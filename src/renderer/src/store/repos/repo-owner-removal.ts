import { callRuntimeRpc } from '../../runtime/rpc/calls/runtime-rpc-call'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import type { ExecutionHostId } from '../../../../shared/execution-host/execution-host'
import type { RepoRegistrationSnapshot } from '../../../../shared/workbench/repo-removal'

/** Removes a project on the host that owns it, always host-scoped (#13071). */
export async function removeRepoOnOwner(
  target: RuntimeClientTarget,
  projectId: string,
  ownerHostId: ExecutionHostId,
  expected?: RepoRegistrationSnapshot
): Promise<void> {
  if (target.kind === 'local') {
    await window.api.repos.removeForHost({
      repoId: projectId,
      hostId: ownerHostId,
      ...(expected ? { expected } : {})
    })
    return
  }
  if (expected) {
    await callRuntimeRpc(target, 'workbench.repo.removeRegistration', undefined, {
      timeoutMs: 15_000,
      wake: true,
      paramsForStatus: () => ({ repoId: projectId, hostId: 'local', ...expected })
    })
    return
  }
  // The user's removal may wake an idle-stopped WSL host (#46567).
  await callRuntimeRpc(target, 'repo.rm', { repo: projectId }, { timeoutMs: 15_000, wake: true })
}
