import type { AppState } from '../types'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import { isMissingRuntimeSessionPlaceholder } from './runtime-session-placeholder-visibility'

/** A session is hidden only when its own host has confirmed the synthetic repo missing. */
export function hasMissingActiveRuntimeSessionPlaceholder(
  state: Pick<
    AppState,
    | 'activeWorktreeId'
    | 'activeWorkspaceExecutionHostId'
    | 'restoredRuntimeHostIdByWorkspaceSessionKey'
    | 'worktreesByRepo'
    | 'runtimeRepoCatalogIdsByHost'
    | 'runtimeStatusByEnvironmentId'
  >
): boolean {
  const id = state.activeWorktreeId
  if (!id) {
    return false
  }
  const host =
    state.activeWorkspaceExecutionHostId ?? state.restoredRuntimeHostIdByWorkspaceSessionKey[id]
  if (!host) {
    return false
  }
  return Object.values(state.worktreesByRepo).some((worktrees) =>
    worktrees.some(
      (worktree) =>
        worktree.id === id &&
        worktree.hostId === host &&
        isMissingRuntimeSessionPlaceholder(
          worktree,
          state.runtimeRepoCatalogIdsByHost,
          state.runtimeStatusByEnvironmentId
        )
    )
  )
}

export function reconcileMissingActiveRuntimeSession(
  state: AppState,
  openWall: () => void,
  previous?: AppState
): void {
  const missingWorktree = hasMissingActiveRuntimeSessionPlaceholder(state)
  const repoId = state.activeRepoId
  const missingRepo = Boolean(
    repoId &&
    state.repos.some(
      (repo) =>
        repo.id === repoId &&
        isMissingRuntimeSessionPlaceholder(
          {
            repoId: repo.id,
            hostId: getRepoExecutionHostId(repo),
            runtimeSessionPlaceholder: repo.runtimeSessionPlaceholder
          },
          state.runtimeRepoCatalogIdsByHost,
          state.runtimeStatusByEnvironmentId
        )
    )
  )
  const removedActiveRepo =
    previous &&
    (state.activeRepoId === null || state.activeRepoId === previous.activeRepoId) &&
    previous.activeRepoId &&
    !state.repos.some(
      (repo) => repo.id === previous.activeRepoId && !repo.runtimeSessionPlaceholder
    ) &&
    previous.runtimeRepoCatalogIdsByHost !== state.runtimeRepoCatalogIdsByHost &&
    previous.repos.some(
      (repo) =>
        repo.id === previous.activeRepoId &&
        isMissingRuntimeSessionPlaceholder(
          {
            repoId: repo.id,
            hostId: getRepoExecutionHostId(repo),
            runtimeSessionPlaceholder: repo.runtimeSessionPlaceholder
          },
          state.runtimeRepoCatalogIdsByHost,
          state.runtimeStatusByEnvironmentId
        )
    )
  if (!missingWorktree && !missingRepo && !removedActiveRepo) {
    return
  }
  if (missingWorktree) {
    state.setActiveWorktree(null)
  }
  state.setActiveRepo(null)
  openWall()
}
