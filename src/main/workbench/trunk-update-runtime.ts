import { parseExecutionHostId } from '../../shared/execution-host'
import type { TrunkUpdateResult } from '../../shared/workbench/trunk-update'
import type { MetricScope } from '../../shared/workbench/metrics'
import { extractExecError } from '../git/exec-error'
import { gitFastForward } from '../git/remote'
import { runTrunkBaseline, type TrunkBaseline } from './trunk-baseline'
import {
  compareTrunk,
  decideTrunkUpdate,
  fetchTrunkBookmark,
  isMainCheckoutPath,
  readTreeHead,
  readTrunkCheckoutState,
  trunkRefusalSentence,
  TRUNK_SYNC_TIMEOUT_MS
} from './trunk-sync'
import { resolveWorkbenchGitExecOptions } from './project-git-routing'
import {
  createWorkbenchWorkspaceResolver,
  nativeWorkbenchWorkspaceHost
} from './workspace-resolver'

type TrunkUpdateRuntime = {
  listRepos: Parameters<typeof nativeWorkbenchWorkspaceHost>[0]['listRepos']
  showManagedWorktree: Parameters<typeof nativeWorkbenchWorkspaceHost>[0]['showManagedWorktree']
  listProjects: Parameters<typeof resolveWorkbenchGitExecOptions>[0]['listProjects']
}

/** One honest line out of a Git/network failure — the refusal sentence stays short. */
function failureDetail(error: unknown): string {
  const { stderr } = extractExecError(error)
  const detail = stderr.trim().split('\n').findLast((line) => line.trim()) ?? ''
  return (detail.trim() || (error instanceof Error ? error.message : String(error)))
    .trim()
    .slice(-160)
}

function refuse(reason: string): TrunkUpdateResult {
  return { updated: false, pulled: 0, reason }
}

/**
 * The one code-sync service behind every「更新代码」button: fetch the trunk
 * bookmark, compare, and fast-forward only when Git can do it without a merge
 * commit — otherwise keep the tree exactly as it is and return the unified
 * refusal sentence. Never runs on screen entry; only a user click gets here.
 */
export function createTrunkUpdateService(runtime: TrunkUpdateRuntime) {
  const resolver = createWorkbenchWorkspaceResolver(nativeWorkbenchWorkspaceHost(runtime))
  return {
    async updateCode(scope: MetricScope): Promise<TrunkUpdateResult> {
      const { target, repo } = await resolver.resolve(scope)
      const host = parseExecutionHostId(target.hostId)
      if (host?.kind !== 'local') {
        // The remote Git relay is read-only by design; SSH main-checkout updates
        // go through the native fast-forward chain instead (project wall parity).
        return refuse('远程工作树暂不支持自动同步，请在会话中处理')
      }
      const execOptions = resolveWorkbenchGitExecOptions(runtime, repo)
      let baseline: TrunkBaseline
      try {
        baseline = await runTrunkBaseline(target.repoPath, repo.worktreeBaseRef ?? null, execOptions)
      } catch (reason) {
        return refuse(reason instanceof Error ? reason.message : String(reason))
      }
      const sync = baseline.sync
      if (!sync) {
        return refuse(
          `代码未更新（基线 ${baseline.ref} 不是可同步的远端分支）。请在项目设置核对基线分支。`
        )
      }
      const isTrunk = isMainCheckoutPath(target.worktreePath, repo.path)
      const treePath = isTrunk ? target.repoPath : target.worktreePath
      const askSession = `请让会话模型处理 ${sync.branchName} 分支的代码更新。`
      try {
        await fetchTrunkBookmark(target.repoPath, sync, execOptions)
      } catch (reason) {
        return refuse(
          `代码未更新（无法从远端获取 ${sync.remoteName}/${sync.branchName} 最新：${failureDetail(reason)}）。${askSession}`
        )
      }
      try {
        const { behind, ahead } = await compareTrunk(treePath, sync, execOptions)
        const state = isTrunk ? await readTrunkCheckoutState(target.repoPath, execOptions) : null
        const decision = decideTrunkUpdate({
          isTrunkCheckout: isTrunk,
          branch: state?.branch ?? null,
          baselineBranch: sync.branchName,
          dirty: state?.dirty ?? false,
          behind,
          ahead
        })
        if (decision.action === 'refuse') {
          return refuse(
            trunkRefusalSentence(decision.reason, {
              branch: state?.branch ?? sync.branchName,
              baselineBranch: sync.branchName,
              behind,
              ahead
            })
          )
        }
        if (decision.action === 'current') {
          return { updated: true, pulled: 0, ref: baseline.ref }
        }
        // Native fast-forward keeps the worktree operation lock and invalidates
        // native Git read caches, so Orca's own views see the new HEAD too.
        await gitFastForward(
          treePath,
          { remoteName: sync.remoteName, branchName: sync.branchName },
          { ...execOptions, signal: AbortSignal.timeout(TRUNK_SYNC_TIMEOUT_MS) }
        )
        return {
          updated: true,
          pulled: decision.behind,
          ref: baseline.ref,
          commit: await readTreeHead(treePath, execOptions)
        }
      } catch (reason) {
        return refuse(`代码未更新（${failureDetail(reason)}）。${askSession}`)
      }
    }
  }
}
