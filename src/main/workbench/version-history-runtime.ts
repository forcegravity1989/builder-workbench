import { parseExecutionHostId } from '../../shared/execution-host'
import type { VersionMaterialResult } from '../../shared/workbench/version-material-request'
import { PlanningMaterialSchema } from '../../shared/workbench/version-material'
import { githubRepoIdentityKey } from '../../shared/github/repository-identity-key'
import type {
  ArchiveProofRequest,
  ArchiveProofResult
} from '../../shared/workbench/version-archive'
import type { MetricScope } from '../../shared/workbench/metrics'
import type { VersionHistoryPort } from '../../shared/workbench/version-history'
import { getActiveMultiplexer } from '../ssh/ssh-target-registry'
import {
  runAdoptedBaseline,
  runReadOnlyHistoryGit,
  type HistoryGitOutcome
} from './history-git-core'
import { resolveWorkbenchGitExecOptions } from './project-git-routing'
import { createVersionHistoryService, type VersionHistoryHost } from './version-history-service'
import { HistorySourceError } from './version-history-snapshot'
import { readCurrentMaterialArchive } from './archive-current-material'
import { createNativeArchiveEvidence } from './archive-evidence-runtime'
import { registeredCodeHubArchiveReason } from './archive-source-gap'
import { nativeVersionMaterialService } from './version-material-runtime'
import {
  createWorkbenchWorkspaceResolver,
  nativeWorkbenchWorkspaceHost,
  type WorkbenchWorkspaceRepo,
  type WorkbenchWorkspaceTarget
} from './workspace-resolver'
import { WorkspaceScopeError } from './workspace-scope-error'

/** Narrow SSH executor budget; remote Git reads are bounded, collections are not routed here. */
const HISTORY_SSH_TIMEOUT_MS = 120_000

type ResolvedWorkspace = Awaited<
  ReturnType<ReturnType<typeof createWorkbenchWorkspaceResolver>['resolve']>
>
type HistoryRuntime = {
  listRepos: Parameters<typeof nativeWorkbenchWorkspaceHost>[0]['listRepos']
  showManagedWorktree: Parameters<typeof nativeWorkbenchWorkspaceHost>[0]['showManagedWorktree']
  listProjects: Parameters<typeof resolveWorkbenchGitExecOptions>[0]['listProjects']
}

async function requestRemote<T>(
  host: Extract<ReturnType<typeof parseExecutionHostId>, { kind: 'ssh' }>,
  target: WorkbenchWorkspaceTarget,
  payload: Record<string, unknown>
): Promise<T> {
  const channel = getActiveMultiplexer(host.targetId)
  if (!channel) {
    throw new WorkspaceScopeError('host-unavailable', '工作树所属的 SSH 主机未连接')
  }
  const result = (await channel.request(
    'workbench.history.execute',
    {
      target: { repoPath: target.repoPath },
      ...payload
    },
    { timeoutMs: HISTORY_SSH_TIMEOUT_MS }
  )) as VersionMaterialResult<T>
  if (!result.ok) {
    const error = new HistorySourceError(
      result.error.code,
      result.error.message
    ) as RemoteHistoryError
    error.exitCode = result.error.exitCode ?? null
    throw error
  }
  return result.value
}

type RemoteHistoryError = HistorySourceError & { exitCode?: number | null }

/**
 * Runs the shared read-only Git core where the repository lives: in-process for
 * local/WSL hosts, through the narrow `workbench.history.execute` relay executor
 * for SSH hosts. provider.exec is never extended and agent.exec never borrowed.
 * `atPath` selects the working tree the command runs in: the repo root for
 * commit-addressed reads, the cycle worktree for own-branch HEAD reads.
 */
async function runHistoryGit(
  target: WorkbenchWorkspaceTarget,
  execOptions: { wslDistro?: string },
  args: readonly string[],
  atPath: 'repo' | 'worktree' = 'repo'
): Promise<HistoryGitOutcome> {
  const host = parseExecutionHostId(target.hostId)
  const path = atPath === 'worktree' ? target.worktreePath : target.repoPath
  if (host?.kind === 'local') {
    return runReadOnlyHistoryGit(path, args, execOptions)
  }
  if (host?.kind !== 'ssh') {
    throw new WorkspaceScopeError('invalid-scope', '请通过工作树所属的 Orca runtime 读取历史')
  }
  try {
    const value = await requestRemote<{ stdout: string }>(
      host,
      { ...target, repoPath: path },
      {
        operation: 'git',
        args: [...args]
      }
    )
    return { ok: true, stdout: Buffer.from(value.stdout, 'base64') }
  } catch (error) {
    if (error instanceof HistorySourceError) {
      return {
        ok: false,
        code: error.code,
        message: error.message,
        exitCode: (error as RemoteHistoryError).exitCode ?? null
      }
    }
    throw error
  }
}

export function nativeVersionHistoryHost(runtime: HistoryRuntime): VersionHistoryHost {
  const resolver = createWorkbenchWorkspaceResolver(nativeWorkbenchWorkspaceHost(runtime))
  const materials = nativeVersionMaterialService(runtime)
  // One RPC request re-resolves the same registered identity many times (log,
  // per-record snapshot, per-candidate proof); memoize it for the call only.
  const resolved = new Map<string, Promise<ResolvedWorkspace>>()
  function workspaceFor(scope: MetricScope): Promise<ResolvedWorkspace> {
    const key = JSON.stringify(scope)
    let promise = resolved.get(key)
    if (!promise) {
      promise = resolver.resolve(scope)
      resolved.set(key, promise)
    }
    return promise
  }

  return {
    async git(scope, args) {
      const { target, repo } = await workspaceFor(scope)
      const outcome = await runHistoryGit(
        target,
        resolveWorkbenchGitExecOptions(runtime, repo),
        args
      )
      if (!outcome.ok) {
        throw new HistorySourceError(outcome.code, outcome.message)
      }
      return outcome.stdout
    },
    async baseline(scope) {
      const { target, repo } = await workspaceFor(scope)
      const adoptedRef = repo.worktreeBaseRef?.trim() || null
      const host = parseExecutionHostId(target.hostId)
      if (host?.kind === 'local') {
        return runAdoptedBaseline(
          target.repoPath,
          adoptedRef,
          resolveWorkbenchGitExecOptions(runtime, repo)
        )
      }
      if (host?.kind !== 'ssh') {
        throw new WorkspaceScopeError('invalid-scope', '请通过工作树所属的 Orca runtime 读取历史')
      }
      return requestRemote<{ ref: string; commit: string }>(host, target, {
        operation: 'baseline',
        adoptedRef
      })
    },
    async worktreeHead(scope) {
      const { target, repo } = await workspaceFor(scope)
      const outcome = await runHistoryGit(
        target,
        resolveWorkbenchGitExecOptions(runtime, repo),
        ['rev-parse', 'HEAD'],
        'worktree'
      )
      if (!outcome.ok) {
        throw new HistorySourceError(outcome.code, outcome.message)
      }
      return outcome.stdout.toString('utf8').trim()
    },
    async listPlanningDirs(scope, commit) {
      const { target, repo } = await workspaceFor(scope)
      const outcome = await runHistoryGit(
        target,
        resolveWorkbenchGitExecOptions(runtime, repo),
        ['ls-tree', '-z', '--name-only', `${commit}:.bw/planning`],
        'worktree'
      )
      if (outcome.ok) {
        return outcome.stdout.toString('utf8').split('\0').filter(Boolean)
      }
      // A cycle branch before its first pull legitimately has no `.bw/planning`
      // yet; Git fatals with exit 128 on the missing path. The commit is pinned
      // from this same worktree's HEAD moments earlier, so other 128 fatals are
      // not expected here; anything else surfaces as a read failure.
      if (outcome.exitCode === 128) {
        return []
      }
      throw new HistorySourceError(outcome.code, outcome.message)
    },
    async readDraft(scope, version) {
      const snapshot = await materials.read({ ...scope, workflow: 'plan', version })
      if (!snapshot) {
        return null
      }
      return {
        document: PlanningMaterialSchema.parse(snapshot.document),
        revision: snapshot.revision
      }
    },
    async archiveState(scope, candidate) {
      const { target, repo } = await workspaceFor(scope)
      const opened = await openArchiveEvidence(
        repo,
        target,
        resolveWorkbenchGitExecOptions(runtime, repo)
      )
      if (!opened.evidence) {
        return { kind: 'unknown' as const, message: opened.gap }
      }
      return opened.evidence.reader.archiveStateForCandidate(candidate)
    }
  }
}

const GITHUB_ARCHIVE_SOURCE_UNRESOLVED = '未解析项目的 GitHub 归档来源，无法核对真实合入'

async function openArchiveEvidence(
  repo: WorkbenchWorkspaceRepo,
  target: WorkbenchWorkspaceTarget,
  execOptions: { wslDistro?: string }
): Promise<
  | {
      evidence: NonNullable<Awaited<ReturnType<typeof createNativeArchiveEvidence>>>
      gap: null
    }
  | { evidence: null; gap: string }
> {
  const codeHub = registeredCodeHubArchiveReason(repo.gitRemoteIdentity)
  if (codeHub) {
    return { evidence: null, gap: codeHub }
  }
  const evidence = await createNativeArchiveEvidence(repo, materialReaderFor(target, execOptions))
  if (!evidence) {
    return { evidence: null, gap: GITHUB_ARCHIVE_SOURCE_UNRESOLVED }
  }
  return { evidence, gap: null }
}

function materialReaderFor(target: WorkbenchWorkspaceTarget, execOptions: { wslDistro?: string }) {
  return async (commit: string, path: string): Promise<Buffer | null> => {
    const outcome = await runHistoryGit(target, execOptions, ['show', `${commit}:${path}`])
    if (outcome.ok) {
      return outcome.stdout
    }
    // Git exit 128 proves the path is absent from that tree; anything else is
    // a read failure and must not masquerade as a revision mismatch.
    if (outcome.exitCode === 128) {
      return null
    }
    throw new HistorySourceError(outcome.code, outcome.message)
  }
}

/**
 * Proof for one provider review the renderer already located: verifies the
 * reference against the repo's real GitHub identity, then the merged commit's
 * material bytes against the exact requested revision.
 */
export async function readArchiveProof(
  runtime: Parameters<typeof nativeVersionHistoryHost>[0],
  params: ArchiveProofRequest
): Promise<ArchiveProofResult> {
  if (params.number === undefined) {
    return readCurrentMaterialArchive(nativeVersionHistoryHost(runtime), params)
  }
  const resolver = createWorkbenchWorkspaceResolver(nativeWorkbenchWorkspaceHost(runtime))
  const { target, repo } = await resolver.resolve({
    repoId: params.repoId,
    worktreeId: params.worktreeId,
    hostId: params.hostId
  })
  const unavailable = (reason: string): ArchiveProofResult => ({
    mergeCommit: null,
    proof: { kind: 'unknown', reason }
  })
  const opened = await openArchiveEvidence(
    repo,
    target,
    resolveWorkbenchGitExecOptions(runtime, repo)
  )
  if (!opened.evidence) {
    return unavailable(opened.gap)
  }
  const evidence = opened.evidence
  if (
    params.provider !== 'github' ||
    params.repository !== githubRepoIdentityKey(evidence.ownerRepo)
  ) {
    return unavailable('归档引用与项目真实 provider 来源不一致')
  }
  const outcome = await evidence.reader.archiveProofForReview(params.number, {
    workflow: params.workflow,
    version: params.version,
    cycleId: params.cycleId,
    revision: params.revision
  })
  return { mergeCommit: outcome.mergeCommit, proof: outcome.proof }
}

export function nativeVersionHistoryService(
  runtime: Parameters<typeof nativeVersionHistoryHost>[0]
): VersionHistoryPort {
  return createVersionHistoryService(nativeVersionHistoryHost(runtime))
}
