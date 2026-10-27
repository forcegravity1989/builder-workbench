import { getTaskPageRepoSourceContext } from '@/components/task-page-source-context'
import { parseCodeHubRemote } from '../../../shared/codehub'
import { normalizeGitRemoteUrl } from '../../../shared/git-remote-identity'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import type { Repo } from '../../../shared/repo-types'
import type { CodeHubTaskDetail } from '../../../shared/codehub-tasks'
import type { TaskSourceContext } from '../../../shared/task-source-context'
import type { TaskPortDeps } from './task-port'
import type { CycleScope, CycleTaskReference } from './version-cycle/ports'

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

function exactIdentityMatch(repo: Repo, repository: string): boolean {
  const identity = repo.gitRemoteIdentity
  const candidates = [
    identity?.canonicalKey,
    identity?.remoteUrl ? (normalizeGitRemoteUrl(identity.remoteUrl) ?? identity.remoteUrl) : null,
    repo.id,
    repo.path
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
    return exactIdentityMatch(repo, reference.repository)
  }
  return exactIdentityMatch(repo, reference.repository)
}

/** Resolve the registered repo a material reference points at; scope's own repo/host wins on ties. */
export function resolveReferenceRepo(
  deps: Pick<TaskPortDeps, 'repos'>,
  scope: Pick<CycleScope, 'repoId' | 'hostId'>,
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
    matches.find((repo) => repo.id === scope.repoId) ??
    matches.find((repo) => getRepoExecutionHostId(repo) === scope.hostId) ??
    matches[0]!
  )
}

export function requireSourceContext(
  repo: Repo,
  provider: 'github' | 'codehub'
): TaskSourceContext {
  const sourceContext = getTaskPageRepoSourceContext(repo, provider)
  if (!sourceContext) {
    throw new Error(`无法解析 ${provider} 任务来源上下文`)
  }
  return sourceContext
}

/** CodeHub references carry no issue/MR kind; read as issue first, then MR. */
export async function viewCodeHubTaskByIid(
  deps: Pick<TaskPortDeps, 'viewCodeHubTask'>,
  repo: Repo,
  iid: number
): Promise<{ kind: 'issue' | 'mr'; detail: CodeHubTaskDetail }> {
  const args = { repoPath: repo.path, repoId: repo.id, iid }
  try {
    return { kind: 'issue', detail: await deps.viewCodeHubTask({ ...args, kind: 'issue' }) }
  } catch (issueError) {
    try {
      return { kind: 'mr', detail: await deps.viewCodeHubTask({ ...args, kind: 'mr' }) }
    } catch (mrError) {
      throw new Error(
        `Issue 读取失败：${errorMessage(issueError)}；MR 读取失败：${errorMessage(mrError)}`
      )
    }
  }
}
