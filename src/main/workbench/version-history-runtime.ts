import { parseExecutionHostId } from '../../shared/execution-host'
import { PlanningMaterialSchema } from '../../shared/workbench/version-material'
import type { MetricScope } from '../../shared/workbench/metrics'
import type { VersionHistoryPort } from '../../shared/workbench/version-history'
import { runReadOnlyHistoryGit, type HistoryGitOutcome } from './history-git-core'
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

type ResolvedWorkspace = Awaited<
  ReturnType<ReturnType<typeof createWorkbenchWorkspaceResolver>['resolve']>
>
type HistoryRuntime = {
  listRepos: Parameters<typeof nativeWorkbenchWorkspaceHost>[0]['listRepos']
  showManagedWorktree: Parameters<typeof nativeWorkbenchWorkspaceHost>[0]['showManagedWorktree']
  listProjects: Parameters<typeof resolveWorkbenchGitExecOptions>[0]['listProjects']
}

/** Read on the owner runtime; HEAD uses the selected worktree, commit reads use the repository. */
async function runHistoryGit(
  target: WorkbenchWorkspaceTarget,
  execOptions: { wslDistro?: string },
  args: readonly string[],
  atPath: 'repo' | 'worktree' = 'repo'
): Promise<HistoryGitOutcome> {
  if (parseExecutionHostId(target.hostId)?.kind !== 'local') {
    throw new WorkspaceScopeError('invalid-scope', '请通过工作树所属的 Orca runtime 读取历史')
  }
  return runReadOnlyHistoryGit(
    atPath === 'worktree' ? target.worktreePath : target.repoPath,
    args,
    execOptions
  )
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
      return runTrunkBaseline(
        target.repoPath,
        pinnedRef,
        resolveWorkbenchGitExecOptions(runtime, repo)
      )
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
