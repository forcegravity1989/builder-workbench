import { isCodeHubHost, isCodeHubGitRemote, parseCodeHubRemote } from './codehub'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from './execution-host'
import { parseGitHubIssueOrPRLink } from './github/links'
import { githubRepoIdentityKey } from './github/repository-identity-key'
import { getProjectProviderIdentity, parseGitHubRemoteUrl } from './project-host-setup-projection'
import type { Repo } from './repo-types'

export type TaskItemLink = {
  provider: 'github' | 'codehub'
  host: string
  repository: string
  kind: 'issue' | 'pr' | 'mr'
  number: number
}

export function parseTaskItemLink(value: string, repos: readonly Repo[] = []): TaskItemLink | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    return null
  }
  if (isCodeHubHost(url.host)) {
    const match = /^\/(.+?)\/(?:-\/)?(issues|merge_requests)\/([1-9]\d*)\/?$/.exec(url.pathname)
    if (!match) {
      return null
    }
    const repository = decodeRepositoryPath(match[1]!)
    const number = Number(match[3])
    return repository && repository.split('/').length >= 2 && Number.isSafeInteger(number)
      ? {
          provider: 'codehub',
          host: url.host.toLowerCase(),
          repository,
          kind: match[2] === 'issues' ? 'issue' : 'mr',
          number
        }
      : null
  }
  const link = parseGitHubIssueOrPRLink(value)
  if (!link || link.number < 1 || !Number.isSafeInteger(link.number)) {
    return null
  }
  const repository = decodeRepositoryPath(`${link.slug.owner}/${link.slug.repo}`)
  if (!repository) {
    return null
  }
  const host = url.host.toLowerCase()
  if (
    host !== 'github.com' &&
    !repos.some((repo) =>
      githubTaskLinkIdentities(repo).some((identity) => (identity.host ?? 'github.com') === host)
    )
  ) {
    return null
  }
  return { provider: 'github', host, repository, kind: link.type, number: link.number }
}

function decodeRepositoryPath(value: string): string | null {
  try {
    const parts = value.split('/').map(decodeURIComponent)
    return parts.every((part) => part && part !== '.' && part !== '..' && !/[\\/\s]/.test(part))
      ? parts.join('/')
      : null
  } catch {
    return null
  }
}

export function githubTaskLinkIdentities(repo: Repo) {
  if (isCodeHubGitRemote(repo.gitRemoteIdentity)) {
    return []
  }
  const primary = getProjectProviderIdentity(repo)
  return [
    primary,
    parseGitHubRemoteUrl(repo.gitRemoteIdentity?.originUrl ?? undefined, Boolean(primary)),
    parseGitHubRemoteUrl(repo.gitRemoteIdentity?.remoteUrl ?? undefined, Boolean(primary)),
    repo.upstream
  ].filter((identity): identity is NonNullable<typeof identity> => Boolean(identity))
}

export function findTaskItemLinkRepo(link: TaskItemLink, repos: readonly Repo[]): Repo | null {
  const key = taskItemLinkIdentityKey(link)
  const matches = repos.filter((repo) => {
    if (!repo.path) {
      return false
    }
    if (link.provider === 'codehub') {
      const remote =
        parseCodeHubRemote(repo.gitRemoteIdentity?.remoteUrl) ??
        parseCodeHubRemote(repo.gitRemoteIdentity?.canonicalKey)
      return remote ? `${remote.host}/${remote.project}`.toLowerCase() === key : false
    }
    return githubTaskLinkIdentities(repo).some(
      (identity) => githubRepoIdentityKey(identity) === key
    )
  })
  return (
    matches.find((repo) => getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID) ??
    matches[0] ??
    null
  )
}

export function taskItemLinkIdentityKey(link: TaskItemLink): string {
  if (link.provider === 'github') {
    const [owner, repo] = link.repository.split('/')
    return githubRepoIdentityKey({ host: link.host, owner: owner!, repo: repo! })
  }
  return `${link.host}/${link.repository}`.toLowerCase()
}
