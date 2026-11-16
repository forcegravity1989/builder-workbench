import { buildExecutionHostRegistry } from '../../../shared/execution-host-registry'
import { resolveWorkspaceCreationTarget } from '@/lib/project-host-workspace-target'
import { getProjectHostSetupProjectionFromState } from '@/store/project-host-setup-selector'
import { repoMatchesHostIdentity } from '@/store/slices/repo-host-identity'
import { selectRepoByIdForActiveWorkspace } from '@/store/selectors'
import type { AppState } from '@/store/types'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import type { Repo } from '../../../shared/repo-types'
import { versionRepoIdentity } from '../../../shared/workbench/version-repo-identity'

export function currentProjectRepo(
  state: Pick<AppState, 'repos' | 'activeRepoId' | 'activeWorkspaceExecutionHostId'>
): Repo | null {
  return selectRepoByIdForActiveWorkspace(state, state.activeRepoId ?? state.repos[0]?.id ?? null)
}

export function resolveProjectSource(
  state: Pick<AppState, 'repos' | 'projects' | 'projectHostSetups' | 'workspaceHostScope'> &
    Partial<
      Pick<
        AppState,
        'settings' | 'runtimeStatusByEnvironmentId' | 'sshTargetLabels' | 'sshConnectionStates'
      >
    > & { runtimeEnvironments?: readonly { id: string; name?: string }[] },
  repo: Repo,
  localOnly = false
): Repo | null {
  const identity = versionRepoIdentity(repo)
  const eligibleRepos = identity
    ? state.repos.filter((row) => versionRepoIdentity(row) === identity)
    : [repo]
  const local = eligibleRepos.find((row) => getRepoExecutionHostId(row) === LOCAL_EXECUTION_HOST_ID)
  if (local || localOnly) {
    return local ?? null
  }
  const { projects, setups } = getProjectHostSetupProjectionFromState(state)
  const selectedHost = getRepoExecutionHostId(repo)
  const projectId = setups.find(
    (setup) => setup.repoId === repo.id && setup.hostId === selectedHost
  )?.projectId
  if (!projectId) {
    return null
  }
  const actionableHostIds = new Set(
    buildExecutionHostRegistry({
      repos: state.repos,
      settings: state.settings,
      runtimeEnvironments: state.runtimeEnvironments,
      runtimeStatusByEnvironmentId: state.runtimeStatusByEnvironmentId,
      sshTargetLabels: state.sshTargetLabels,
      sshConnectionStates: state.sshConnectionStates,
      hostSource: 'configured-only'
    }).map((host) => host.id)
  )
  const result = resolveWorkspaceCreationTarget({
    eligibleRepos,
    projects,
    projectHostSetups: setups.filter((setup) =>
      eligibleRepos.some((row) => repoMatchesHostIdentity(row, setup.repoId, setup.hostId))
    ),
    projectId,
    focusedHostScope: state.workspaceHostScope,
    actionableHostIds
  })
  return result.status === 'ready' ? result.target.repo : null
}
