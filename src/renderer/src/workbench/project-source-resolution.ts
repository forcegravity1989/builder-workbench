import { buildExecutionHostRegistry } from '../../../shared/execution-host/execution-host-registry'
import { resolveWorkspaceCreationTarget } from '@/lib/workspace/creation/project-host-workspace-target'
import { getProjectHostSetupProjectionFromState } from '@/store/projects/project-host-setup-selector'
import { repoMatchesHostIdentity } from '@/store/repos/repo-host-identity'
import { selectRepoByIdForActiveWorkspace } from '@/store/repos/active-workspace-repository'
import type { AppState } from '@/store/types'
import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID
} from '../../../shared/execution-host/execution-host'
import type { Repo } from '../../../shared/repository/repo-types'
import { versionRepoIdentity } from '../../../shared/workbench/version-repo-identity'
import { readBots, readBotsEnabled } from '@/lib/bot-catalog'
import { readBotGroups } from '@/lib/bot-group-catalog-snapshot'
import { botOfHomeWorkspace } from '../../../shared/bots/bot-homes'
import { resolveIndexedWorktreeOwner } from '@/lib/workspace/ownership/worktree-runtime-owner-index'
import { findRepoForHost } from '@/store/repos/repo-host-identity'
import { normalizeWorkspaceSessionKeyToWorkspaceId } from '../../../shared/workspace/identity/workspace-scope'

export type SidebarProjectState = Pick<
  AppState,
  | 'repos'
  | 'activeRepoId'
  | 'activeWorkspaceExecutionHostId'
  | 'activeWorkspaceKey'
  | 'worktreeNavHistory'
  | 'worktreeNavHistoryIndex'
  | 'worktreesByRepo'
>

export function isWorkbenchBotWorkspace(workspace: string | null | undefined): boolean {
  return (
    !!workspace &&
    readBotsEnabled() &&
    !!(botOfHomeWorkspace(readBots(), workspace) || botOfHomeWorkspace(readBotGroups(), workspace))
  )
}

export function workbenchSidebarProjectRepo(state: SidebarProjectState): Repo | null {
  if (!isWorkbenchBotWorkspace(state.activeWorkspaceKey)) {
    return currentProjectRepo(state)
  }
  for (let i = state.worktreeNavHistoryIndex - 1; i >= 0; i--) {
    const entry = state.worktreeNavHistory[i]
    if (typeof entry !== 'string') {
      continue
    }
    const owner = resolveIndexedWorktreeOwner(
      state.worktreesByRepo,
      normalizeWorkspaceSessionKeyToWorkspaceId(entry)
    )
    if (owner.kind === 'resolved') {
      const repo = findRepoForHost(state.repos, owner.owner.repoId, { hostId: owner.owner.hostId })
      if (repo) {
        return repo
      }
    }
  }
  return state.repos.find((repo) => repo.kind !== 'folder') ?? null
}

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
