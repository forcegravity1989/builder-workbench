import { parseExecutionHostId } from '../../shared/execution-host'
import type { CycleSyncResult } from '../../shared/workbench/cycle-sync'
import type { MetricScope } from '../../shared/workbench/metrics'
import { gitPull } from '../git/remote'
import { runAdoptedBaseline } from './history-git-core'
import { resolveWorkbenchGitExecOptions } from './project-git-routing'
import {
  createWorkbenchWorkspaceResolver,
  nativeWorkbenchWorkspaceHost
} from './workspace-resolver'

/** The trunk pull must not hang screen entry; a timeout fails honestly instead. */
const SYNC_TIMEOUT_MS = 60_000

type CycleSyncRuntime = {
  listRepos: Parameters<typeof nativeWorkbenchWorkspaceHost>[0]['listRepos']
  showManagedWorktree: Parameters<typeof nativeWorkbenchWorkspaceHost>[0]['showManagedWorktree']
  listProjects: Parameters<typeof resolveWorkbenchGitExecOptions>[0]['listProjects']
}

/**
 * Splits the resolved adopted ref into a pull source. A ref without a remote
 * part falls back to origin; the adopted source itself never silently switches
 * (resolveAdoptedBaseline owns that rule).
 */
export function trunkPullTarget(adoptedRef: string): {
  remoteName: string
  branchName: string
} | null {
  const ref = adoptedRef.trim()
  if (!ref) {
    return null
  }
  const slash = ref.indexOf('/')
  if (slash > 0 && slash < ref.length - 1) {
    return { remoteName: ref.slice(0, slash), branchName: ref.slice(slash + 1) }
  }
  return { remoteName: 'origin', branchName: ref }
}

export function createCycleSyncService(runtime: CycleSyncRuntime) {
  const resolver = createWorkbenchWorkspaceResolver(nativeWorkbenchWorkspaceHost(runtime))
  return {
    /**
     * Pulls the adopted trunk into the cycle branch on screen entry, so the
     * board and the session working in the same worktree see identical files.
     * Failures and conflicts never switch the board to another data source:
     * the branch stays as-is and the reason goes to the user, who can resolve
     * it in a session with the working model.
     */
    async syncTrunk(scope: MetricScope): Promise<CycleSyncResult> {
      const { target, repo } = await resolver.resolve(scope)
      const host = parseExecutionHostId(target.hostId)
      if (host?.kind !== 'local') {
        // The remote Git relay is read-only by design; a write side is a
        // separate wire-protocol task, not a silent skip.
        return { synced: false, reason: '远程工作树暂不自动同步主干，请在会话中处理' }
      }
      const execOptions = resolveWorkbenchGitExecOptions(runtime, repo)
      let adopted: { ref: string }
      try {
        adopted = await runAdoptedBaseline(target.repoPath, repo.worktreeBaseRef ?? null, execOptions)
      } catch (reason) {
        return {
          synced: false,
          reason: reason instanceof Error ? reason.message : String(reason)
        }
      }
      const pullTarget = trunkPullTarget(adopted.ref)
      if (!pullTarget) {
        return { synced: false, reason: '无法解析采用分支的拉取来源' }
      }
      try {
        await gitPull(target.worktreePath, pullTarget, {
          ...execOptions,
          signal: AbortSignal.timeout(SYNC_TIMEOUT_MS)
        })
        return { synced: true }
      } catch (reason) {
        return {
          synced: false,
          reason: reason instanceof Error ? reason.message : String(reason)
        }
      }
    }
  }
}
