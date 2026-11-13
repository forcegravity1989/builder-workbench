import { getRepoTaskSourceContext } from '@/components/task-page-source-context'
import { parseCodeHubRemote } from '../../../shared/codehub'
import { normalizeGitRemoteUrl } from '../../../shared/git-remote-identity'
import {
  getRepoExecutionHostId,
  getRepoSshConnectionId,
  parseExecutionHostId,
  toRuntimeExecutionHostId
} from '../../../shared/execution-host'
import { getProjectProviderIdentity } from '../../../shared/project-host-setup-projection'
import type { GitHubOwnerRepo } from '../../../shared/github/pull-request-types'
import type { Repo } from '../../../shared/repo-types'
import type { CodeHubTaskDetail } from '../../../shared/codehub-tasks'
import type { TaskSourceContext } from '../../../shared/task-source-context'
import type { TaskPortDeps } from './task-port'
import type { CycleScope, CycleTaskReference } from './version-cycle/ports'

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

export type TaskReadHome = Pick<CycleScope, 'repoId' | 'hostId' | 'runtimeOwnerEnvironmentId'>

export function repoOnTaskHost(
  repo: Repo,
  home: Pick<TaskReadHome, 'hostId' | 'runtimeOwnerEnvironmentId'>
): boolean {
  const host = getRepoExecutionHostId(repo)
  if (!home.runtimeOwnerEnvironmentId) {
    return host === home.hostId
  }
  if (host !== toRuntimeExecutionHostId(home.runtimeOwnerEnvironmentId)) {
    return false
  }
  const logicalHost = parseExecutionHostId(home.hostId)
  return logicalHost?.kind !== 'ssh' || getRepoSshConnectionId(repo) === logicalHost.targetId
}

const githubIssueSources = new WeakMap<Repo, { repository: string; source: GitHubOwnerRepo }>()

export function rememberGitHubIssueSource(
  repo: Repo,
  repository: string,
  source: GitHubOwnerRepo
): void {
  githubIssueSources.set(repo, { repository, source })
}

export function knownGitHubIssueSource(
  repo: Repo | undefined,
  repository: string
): GitHubOwnerRepo | undefined {
  const known = repo && githubIssueSources.get(repo)
  return known?.repository === repository ? known.source : undefined
}

function exactIdentityMatch(repo: Repo, repository: string): boolean {
  const identity = repo.gitRemoteIdentity
  const candidates = [
    identity?.canonicalKey,
    identity?.remoteUrl ? (normalizeGitRemoteUrl(identity.remoteUrl) ?? identity.remoteUrl) : null,
    repo.id,
    repo.path,
    repo.upstream &&
      `${repo.upstream.host ?? 'github.com'}/${repo.upstream.owner}/${repo.upstream.repo}`
  ]
  return candidates.some((candidate) => candidate === repository)
}

/** CodeHub prefers its own project path, falling back to identity-key equality. */
function codeHubIdentityMatches(repo: Repo, repository: string): boolean {
  const remote =
    parseCodeHubRemote(repo.gitRemoteIdentity?.remoteUrl) ??
    parseCodeHubRemote(repo.gitRemoteIdentity?.canonicalKey)
  if (!remote) {
    return false
  }
  const wanted = repository
    .trim()
    .replace(/\.git$/i, '')
    .replace(/^\/+/, '')
  return wanted === remote.project || wanted === `${remote.host}/${remote.project}`
}

function repoMatchesReference(repo: Repo, reference: CycleTaskReference): boolean {
  if (reference.provider === 'codehub') {
    return (
      codeHubIdentityMatches(repo, reference.repository) ||
      exactIdentityMatch(repo, reference.repository)
    )
  }
  if (reference.provider === 'github') {
    if (
      parseCodeHubRemote(repo.gitRemoteIdentity?.remoteUrl) ||
      parseCodeHubRemote(repo.gitRemoteIdentity?.canonicalKey)
    ) {
      return false
    }
    return (
      Boolean(knownGitHubIssueSource(repo, reference.repository)) ||
      exactIdentityMatch(repo, reference.repository)
    )
  }
  return exactIdentityMatch(repo, reference.repository)
}

/** Resolve the registered repo a material reference points at; scope's own repo/host wins on ties. */
export function resolveReferenceRepo(
  deps: Pick<TaskPortDeps, 'repos'>,
  scope: TaskReadHome,
  reference: CycleTaskReference
): Repo | null {
  const wanted = normalizeGitRemoteUrl(reference.repository) ?? reference.repository
  const matches = deps
    .repos()
    .filter((repo) => repo.path && repoMatchesReference(repo, { ...reference, repository: wanted }))
  if (matches.length === 0) {
    return null
  }
  return (
    matches.find((repo) => repo.id === scope.repoId && repoOnTaskHost(repo, scope)) ??
    matches.find((repo) => repoOnTaskHost(repo, scope)) ??
    (scope.runtimeOwnerEnvironmentId ? null : matches[0]!)
  )
}

export function gitHubIdentityForTaskReference(
  repo: Repo,
  repository: string
): GitHubOwnerRepo | undefined {
  const known = knownGitHubIssueSource(repo, repository)
  if (known) {
    return known
  }
  const origin = getProjectProviderIdentity({
    gitRemoteIdentity: repo.gitRemoteIdentity,
    upstream: null,
    repoIcon: null
  })
  if (origin && exactIdentityMatch({ ...repo, upstream: null }, repository)) {
    return origin
  }
  if (repo.upstream && exactIdentityMatch(repo, repository)) {
    return repo.upstream
  }
  return undefined
}

export function requireSourceContext(
  repo: Repo,
  provider: 'github' | 'codehub'
): TaskSourceContext {
  const sourceContext = getRepoTaskSourceContext(repo, provider)
  if (!sourceContext) {
    throw new Error(`无法解析 ${provider} 任务来源上下文`)
  }
  return sourceContext
}

/** Legacy references without a kind can point to either CodeHub object. */
export async function viewCodeHubTaskByIid(
  deps: Pick<TaskPortDeps, 'viewCodeHubTask'>,
  repo: Repo,
  reference: Pick<CycleTaskReference, 'number' | 'kind'>,
  beforeFallback?: () => void
): Promise<{ kind: 'issue' | 'mr'; detail: CodeHubTaskDetail }> {
  const args = {
    repoPath: repo.path,
    repoId: repo.id,
    iid: reference.number,
    sourceContext: requireSourceContext(repo, 'codehub')
  }
  try {
    return { kind: 'issue', detail: await deps.viewCodeHubTask({ ...args, kind: 'issue' }) }
  } catch (issueError) {
    if (reference.kind === 'issue') {
      throw issueError
    }
    beforeFallback?.()
    try {
      return { kind: 'mr', detail: await deps.viewCodeHubTask({ ...args, kind: 'mr' }) }
    } catch (mrError) {
      throw new Error(
        `Issue 读取失败：${errorMessage(issueError)}；MR 读取失败：${errorMessage(mrError)}`
      )
    }
  }
}
