import { parseExecutionHostId } from '../../shared/execution-host'
import { stripCredentialsFromMessage } from '../../shared/git-remote-error'
import type { TrunkUpdateResult } from '../../shared/workbench/trunk-update'
import type { MetricScope } from '../../shared/workbench/metrics'
import { extractExecError } from '../git/exec-error'
import { gitFastForward, gitFetchAll, gitMergeNoFf } from '../git/remote'
import { abortMerge, detectConflictOperation } from '../git/status'
import { runTrunkBaseline, type TrunkBaseline } from './trunk-baseline'
import {
  compareTrunk,
  decideTrunkUpdate,
  fetchTrunkBookmark,
  readTreeHead,
  readTrunkCheckoutState,
  remoteBranchExists,
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

/**
 * One honest line out of a Git/network failure — the refusal sentence stays
 * short, and credentials embedded in remote URLs never reach the user surface.
 */
function failureDetail(error: unknown): string {
  const { stderr } = extractExecError(error)
  const detail =
    stderr
      .trim()
      .split('\n')
      .findLast((line) => line.trim()) ?? ''
  return stripCredentialsFromMessage(
    detail.trim() || (error instanceof Error ? error.message : String(error))
  )
    .trim()
    .slice(-160)
}

function refuse(reason: string): TrunkUpdateResult {
  return { updated: false, pulled: 0, reason }
}

/**
 * The one code-sync service behind every「更新代码」button. Two shapes, one
 * honest contract:
 *
 * - Main checkout: fetch the trunk bookmark and fast-forward only. Any local
 *   commit or edit is the user's, so it refuses instead of discarding them.
 * - Version flow branch: fetch every remote, then merge the latest trunk into
 *   the branch (a real merge commit, never a rebase), and also merge this
 *   branch's own remote so teammates' commits come in. A clean merge succeeds.
 *   A genuine Git conflict aborts only the merge that failed; an earlier merge
 *   may already have landed (flow trees carry drafts, so no hard reset is safe),
 *   and the refusal says so honestly before handing the branch to a session.
 *
 * Never runs on screen entry; only a user click gets here.
 */
export function createTrunkUpdateService(runtime: TrunkUpdateRuntime) {
  const resolver = createWorkbenchWorkspaceResolver(nativeWorkbenchWorkspaceHost(runtime))
  return {
    async updateCode(scope: MetricScope): Promise<TrunkUpdateResult> {
      const { target, repo } = await resolver.resolve(scope)
      const host = parseExecutionHostId(target.hostId)
      if (host?.kind !== 'local') {
        // The remote Git relay is read-only by design; SSH updates stay out of
        // this local path and are handled by the native chain or a session.
        return refuse('代码未更新（远程工作树暂不支持自动同步）。请在会话中处理。')
      }
      const execOptions = resolveWorkbenchGitExecOptions(runtime, repo)
      let baseline: TrunkBaseline
      try {
        baseline = await runTrunkBaseline(
          target.repoPath,
          repo.worktreeBaseRef ?? null,
          execOptions
        )
      } catch (reason) {
        return refuse(
          `代码未更新（${reason instanceof Error ? reason.message : String(reason)}）。请在会话中处理。`
        )
      }
      const sync = baseline.sync
      if (!sync) {
        return refuse(
          `代码未更新（基线 ${baseline.ref} 不是可同步的远端分支）。请在项目设置核对基线分支。`
        )
      }
      // Main-checkout identity comes from the native worktree record, never a
      // path comparison that symlinks or short names could fool.
      const isTrunk = target.isMainWorktree
      const treePath = isTrunk ? target.repoPath : target.worktreePath
      let branch: string
      let dirty: boolean
      try {
        const state = await readTrunkCheckoutState(treePath, execOptions)
        branch = state.branch
        dirty = state.dirty
      } catch (reason) {
        return refuse(`代码未更新（${failureDetail(reason)}）。请在会话中处理。`)
      }
      const askSession = `请让会话模型处理 ${branch} 分支的代码更新。`

      if (isTrunk) {
        // ---- Main checkout: fetch the bookmark, then fast-forward only. ----
        const timeoutOptions = {
          ...execOptions,
          signal: AbortSignal.timeout(TRUNK_SYNC_TIMEOUT_MS)
        }
        try {
          await fetchTrunkBookmark(target.repoPath, sync, execOptions)
        } catch (reason) {
          return refuse(
            `代码未更新（无法从远端获取 ${sync.remoteName}/${sync.branchName} 最新：${failureDetail(reason)}）。${askSession}`
          )
        }
        try {
          const { behind, ahead } = await compareTrunk(treePath, sync, execOptions)
          const decision = decideTrunkUpdate({
            isTrunkCheckout: true,
            branch,
            baselineBranch: sync.branchName,
            dirty,
            behind,
            ahead
          })
          if (decision.action === 'refuse') {
            return refuse(
              trunkRefusalSentence(decision.reason, {
                branch,
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
            timeoutOptions
          )
          let commit: string | undefined
          try {
            commit = await readTreeHead(treePath, execOptions)
          } catch {
            // The fast-forward already succeeded; a failing HEAD read-back must
            // not demote the honest result — the toast just omits the commit id.
          }
          return {
            updated: true,
            pulled: decision.behind,
            ref: baseline.ref,
            ...(commit ? { commit } : {})
          }
        } catch (reason) {
          return refuse(`代码未更新（${failureDetail(reason)}）。${askSession}`)
        }
      }

      // ---- Version flow branch: merge the latest trunk (and own remote) in. ----
      const flowOptions = () => ({
        ...execOptions,
        signal: AbortSignal.timeout(TRUNK_SYNC_TIMEOUT_MS)
      })
      // A tree already mid-merge/rebase/cherry-pick is the user's own in-progress
      // work — never run a merge over it, and never abort it.
      try {
        const op = await detectConflictOperation(treePath, execOptions)
        if (op !== 'unknown') {
          const label = op === 'merge' ? '合并' : op === 'rebase' ? '变基' : '拣选'
          return refuse(`代码未更新（工作树已处于${label}中，请先在会话处理）。${askSession}`)
        }
      } catch (reason) {
        return refuse(`代码未更新（无法读取工作树状态：${failureDetail(reason)}）。${askSession}`)
      }
      try {
        await gitFetchAll(treePath, flowOptions())
      } catch (reason) {
        return refuse(`代码未更新（无法获取远端最新：${failureDetail(reason)}）。${askSession}`)
      }
      const merges: { ref: string; behind: number; kind: 'trunk' | 'remote' }[] = []
      let mergedCount = 0
      let activeRef = ''
      try {
        const trunkComparison = await compareTrunk(treePath, sync, execOptions)
        const decision = decideTrunkUpdate({
          isTrunkCheckout: false,
          branch,
          baselineBranch: sync.branchName,
          dirty,
          behind: trunkComparison.behind,
          ahead: trunkComparison.ahead
        })
        if (decision.action === 'merge') {
          merges.push({
            ref: `${sync.remoteName}/${sync.branchName}`,
            behind: decision.behind,
            kind: 'trunk'
          })
        }
        // This branch's own remote: teammates may already have pushed here, so
        // bring those commits in too. Absent remote-tracking ref → skip quietly.
        if (
          branch &&
          branch !== sync.branchName &&
          (await remoteBranchExists(
            treePath,
            { remoteName: sync.remoteName, branchName: branch },
            execOptions
          ))
        ) {
          const ownComparison = await compareTrunk(
            treePath,
            { remoteName: sync.remoteName, branchName: branch },
            execOptions
          )
          if (ownComparison.behind > 0) {
            merges.push({
              ref: `${sync.remoteName}/${branch}`,
              behind: ownComparison.behind,
              kind: 'remote'
            })
          }
        }
        if (merges.length === 0) {
          return { updated: true, pulled: 0, ref: branch }
        }
        let pulled = 0
        for (const merge of merges) {
          activeRef = merge.ref
          await gitMergeNoFf(treePath, merge.ref, flowOptions())
          mergedCount += 1
          pulled += merge.behind
        }
        let commit: string | undefined
        try {
          commit = await readTreeHead(treePath, execOptions)
        } catch {
          // Merge already landed; omit the commit id rather than fail the result.
        }
        const trunkMerged = merges.some((merge) => merge.kind === 'trunk')
        return {
          updated: true,
          pulled,
          ref: branch,
          ...(trunkMerged ? { merged: true } : {}),
          ...(commit ? { commit } : {})
        }
      } catch (reason) {
        // Undo only the merge that actually failed. If an earlier merge already
        // landed, the tree moved — say so honestly instead of claiming nothing
        // changed (a flow tree may carry drafts, so no hard reset is safe).
        try {
          await abortMerge(treePath, execOptions)
        } catch {
          // Nothing to abort (failure was fetch/compare, or no merge started).
        }
        if (mergedCount > 0) {
          return refuse(
            `代码未更新（已把部分远端提交合入 ${branch}，但合并 ${activeRef} 时失败：${failureDetail(reason)}）。${askSession}`
          )
        }
        return refuse(
          `代码未更新（合并 ${activeRef || '远端最新'} 到 ${branch} 时失败：${failureDetail(reason)}）。${askSession}`
        )
      }
    }
  }
}
