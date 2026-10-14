import { parseExecutionHostId } from '../../shared/execution-host'
import type { VersionMaterialResult } from '../../shared/workbench/version-material-request'
import { PlanningMaterialSchema } from '../../shared/workbench/version-material'
import type { MetricScope } from '../../shared/workbench/metrics'
import type { VersionHistoryPort } from '../../shared/workbench/version-history'
import { getActiveMultiplexer } from '../ssh/ssh-target-registry'
import {
  runReadOnlyHistoryGit,
  type HistoryGitOutcome
} from './history-git-core'
import { runTrunkBaseline } from './trunk-baseline'
import { resolveWorkbenchGitExecOptions } from './project-git-routing'
import { createVersionHistoryService, type VersionHistoryHost } from './version-history-service'
import { HistorySourceError } from './version-history-snapshot'
import { nativeVersionMaterialService } from './version-material-runtime'
import {
  createWorkbenchWorkspaceResolver,
  nativeWorkbenchWorkspaceHost,
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
      const pinnedRef = repo.worktreeBaseRef?.trim() || null
      const host = parseExecutionHostId(target.hostId)
      if (host?.kind === 'local') {
        return runTrunkBaseline(
          target.repoPath,
          pinnedRef,
          resolveWorkbenchGitExecOptions(runtime, repo)
        )
      }
      if (host?.kind !== 'ssh') {
        throw new WorkspaceScopeError('invalid-scope', '请通过工作树所属的 Orca runtime 读取历史')
      }
      // Wire field keeps its historical name so an older remote build still
      // parses the request; it carries the pinned worktreeBaseRef.
      return requestRemote<{ ref: string; commit: string }>(host, target, {
        operation: 'baseline',
        adoptedRef: pinnedRef
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
    }
  }
}

export function nativeVersionHistoryService(
  runtime: Parameters<typeof nativeVersionHistoryHost>[0]
): VersionHistoryPort {
  return createVersionHistoryService(nativeVersionHistoryHost(runtime))
}
