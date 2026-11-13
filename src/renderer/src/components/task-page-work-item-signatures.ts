import type { GitHubWorkItem } from '../../../shared/github/work-item-types'
import { parseGitHubIssueOrPRLink } from '../../../shared/github/links'
import { githubRepoIdentityKey } from '../../../shared/github/repository-identity-key'
import type { GitHubOwnerRepo } from '../../../shared/github/pull-request-types'

type WorkItemRepository = Pick<GitHubWorkItem, 'prRepo' | 'url'>

export function taskPageWorkItemRepository(item: WorkItemRepository) {
  const fromUrl = parseGitHubIssueOrPRLink(item.url ?? '')?.slug
  return item.prRepo
    ? { ...item.prRepo, host: item.prRepo.host ?? fromUrl?.host }
    : (fromUrl ?? null)
}

export function matchesTaskPageWorkItemRepository(
  item: WorkItemRepository,
  repository: GitHubOwnerRepo
): boolean {
  const actual = taskPageWorkItemRepository(item)
  return actual !== null && githubRepoIdentityKey(actual) === githubRepoIdentityKey(repository)
}

export function taskPageWorkItemKey(
  item: Pick<GitHubWorkItem, 'repoId' | 'id'> & WorkItemRepository
): string {
  const repo = taskPageWorkItemRepository(item)
  return JSON.stringify([item.repoId, item.id, repo ? githubRepoIdentityKey(repo) : item.url])
}

export function sortedStrings(values: readonly string[] | undefined): string {
  return [...(values ?? [])].sort().join('\u0000')
}

function sortedLogins(users: readonly { login: string | null | undefined }[] | undefined): string {
  return [...(users ?? [])]
    .map((user) => user.login ?? '')
    .sort()
    .join('\u0000')
}

export function taskPageWorkItemStatusSignature(item: GitHubWorkItem): string {
  return JSON.stringify([
    item.type,
    item.number,
    item.title,
    item.state,
    item.url,
    item.author,
    item.branchName ?? null,
    item.baseRefName ?? null,
    sortedStrings(item.labels),
    sortedLogins(item.assignees),
    sortedLogins(item.reviewRequests),
    item.reviewDecision ?? null,
    item.checksSummary?.state ?? null,
    item.checksSummary?.total ?? null,
    item.checksSummary?.failed ?? null,
    item.checksSummary?.pending ?? null,
    item.checksSummary?.neutral ?? null,
    item.mergeable ?? null,
    item.autoMergeEnabled ?? null,
    item.autoMergeAllowed ?? null,
    item.mergeQueueRequired ?? null,
    item.mergeStateStatus ?? null,
    item.updatedAt
  ])
}

export function taskPageWorkItemKeyOrderSignature(items: readonly GitHubWorkItem[]): string {
  return items.map(taskPageWorkItemKey).join('\u0000')
}

export function taskPageWorkItemPaginationBoundary(
  items: readonly GitHubWorkItem[]
): string | null {
  return items.at(-1)?.updatedAt ?? null
}
