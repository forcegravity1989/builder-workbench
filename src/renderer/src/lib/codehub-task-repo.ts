import type { Repo } from '../../../shared/repo-types'
import type { CodeHubTaskItem } from '../../../shared/codehub-tasks'
import { getRepoExecutionHostId } from '../../../shared/execution-host'

/** A missing or ambiguous owner must not fall through to another Builder with the same repo id. */
export function findCodeHubTaskRepo(
  repos: readonly Repo[],
  item: Pick<CodeHubTaskItem, 'repoId' | 'repoPath' | 'executionHostId'>
): Repo | null {
  const matches = repos.filter(
    (repo) =>
      repo.id === item.repoId &&
      (!item.repoPath || repo.path === item.repoPath) &&
      (!item.executionHostId || getRepoExecutionHostId(repo) === item.executionHostId)
  )
  return matches.length === 1 ? matches[0] : null
}
