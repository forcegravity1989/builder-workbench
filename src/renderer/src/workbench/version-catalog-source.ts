import type { Repo } from '../../../shared/repository/repo-types'
import type { Worktree } from '../../../shared/worktree/types'
import {
  getRepoExecutionHostId,
  getRepoSshConnectionId,
  parseExecutionHostId,
  type ExecutionHostId
} from '../../../shared/execution-host/execution-host'
import { getWorktreeHostIdentity } from '../../../shared/worktree/host-qualified-identity'
import { versionRepoIdentity } from '../../../shared/workbench/version-repo-identity'
import { findRepoForHost } from '@/store/repos/repo-host-identity'
import {
  worktreeHostMatchOptions,
  worktreeMatchesHost
} from '@/store/slices/worktrees/listing/worktree-host-ownership'
import { worktreeFingerprintTuple } from './worktree-fingerprint'

export function versionCatalogSshTargetId(repo: Repo): string | null {
  const host = parseExecutionHostId(getRepoExecutionHostId(repo))
  return getRepoSshConnectionId(
    host?.kind === 'runtime' && repo.pairedRegistration
      ? { ...repo, executionHostId: repo.pairedRegistration.hostId }
      : repo
  )
}

export function versionCatalogSources(
  repos: readonly Repo[],
  repoId: string | null,
  hostId?: ExecutionHostId | null
): Repo[] {
  if (!repoId) {
    return []
  }
  const target = hostId
    ? findRepoForHost(repos, repoId, { hostId })
    : repos.find((repo) => repo.id === repoId)
  if (!target) {
    return []
  }
  const identity = versionRepoIdentity(target)
  return repos.filter(
    (repo) =>
      (identity ? versionRepoIdentity(repo) === identity : repo.id === repoId) &&
      (!hostId || getRepoExecutionHostId(repo) === hostId)
  )
}

export function versionCatalogSourceKey(sources: readonly Repo[]): string {
  return JSON.stringify(
    sources
      .map((repo) => [
        repo.id,
        getRepoExecutionHostId(repo),
        repo.path,
        versionRepoIdentity(repo),
        repo.pairedRegistration,
        repo.worktreeBaseRef
      ])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  )
}

export function versionCatalogWorktrees(
  repos: readonly Repo[],
  sources: readonly Repo[],
  visible: Record<string, Worktree[]>,
  detected: Record<string, { worktrees: Worktree[] } | undefined>
): Worktree[] {
  const trees = new Map<string, Worktree>()
  for (const repo of sources) {
    const hostId = getRepoExecutionHostId(repo)
    const options = worktreeHostMatchOptions({ repos }, repo.id, hostId)
    for (const tree of [...(visible[repo.id] ?? []), ...(detected[repo.id]?.worktrees ?? [])]) {
      if (worktreeMatchesHost(tree, hostId, options)) {
        trees.set(
          JSON.stringify([getWorktreeHostIdentity(tree), tree.runtimeOwnerEnvironmentId]),
          tree
        )
      }
    }
  }
  return [...trees.values()]
}

/** Reordering and session activity do not change the material sources. */
export function versionCatalogFingerprint(worktrees: readonly Worktree[]): string {
  return JSON.stringify(
    worktrees
      .map((tree) =>
        JSON.stringify([
          getWorktreeHostIdentity(tree),
          tree.runtimeOwnerEnvironmentId,
          tree.projectId,
          tree.isMainWorktree,
          tree.branch,
          tree.head,
          worktreeFingerprintTuple(tree)
        ])
      )
      .sort()
  )
}
