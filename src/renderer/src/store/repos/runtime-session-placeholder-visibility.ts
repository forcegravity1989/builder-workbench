import type { RuntimeEnvironmentStatus } from '../slices/runtime-status-types'
import type { Repo } from '../../../../shared/repo-types'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'

/** Only a reachable host's successful catalog can establish that a synthetic session owner is missing. */
export function isMissingRuntimeSessionPlaceholder(
  item: { runtimeSessionPlaceholder?: true; hostId?: string; repoId: string },
  catalogs: Readonly<Record<string, readonly string[]>>,
  statuses: ReadonlyMap<string, RuntimeEnvironmentStatus>
): boolean {
  if (!item.runtimeSessionPlaceholder || !item.hostId?.startsWith('runtime:')) {
    return false
  }
  const environmentId = item.hostId.slice('runtime:'.length)
  const ids = catalogs[item.hostId]
  return Boolean(statuses.get(environmentId)?.status && ids && !ids.includes(item.repoId))
}

export function visibleRuntimeSessionRepos(
  repos: readonly Repo[],
  catalogs: Readonly<Record<string, readonly string[]>>,
  statuses: ReadonlyMap<string, RuntimeEnvironmentStatus>
): readonly Repo[] {
  const visible = repos.filter(
    (repo) =>
      !isMissingRuntimeSessionPlaceholder(
        {
          repoId: repo.id,
          hostId: getRepoExecutionHostId(repo),
          runtimeSessionPlaceholder: repo.runtimeSessionPlaceholder
        },
        catalogs,
        statuses
      )
  )
  return visible.length === repos.length ? repos : visible
}
