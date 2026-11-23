import { parseGitRevListAheadBehindCounts } from '../../shared/git-rev-list-output'
import { branchFullRef } from '../../shared/workbench/branch-ref'
import { SourceCommit } from '../../shared/workbench/version-material'
import { gitOptionsForWorktree, type GitRuntimeOptions } from '../git/git-runtime-options'
import {
  postponeRepoRefMaintenance,
  withRepoRefMaintenancePaused
} from '../git/local-repo-ref-maintenance'
import { gitExecFileAsync } from '../git/runner'
import type { TrunkGitExec, TrunkSyncTarget } from './trunk-baseline'

export const TRUNK_SYNC_TIMEOUT_MS = 60_000
export const TRUNK_UPDATE_BUDGET_MS = 240_000

export type TrunkSyncSource = TrunkSyncTarget & { trackingRef: string }
export type FetchedTrunkSource = { ref: string; commit: string }
export type TrunkCheckoutState = { branch: string; head: string }

export function trunkSyncSource(target: TrunkSyncTarget): TrunkSyncSource {
  return {
    ...target,
    trackingRef: target.trackingRef ?? `refs/remotes/${target.remoteName}/${target.branchName}`
  }
}

/** Refresh one configured branch and pin the complete tracking ref to a commit. */
export async function fetchTrunkSource(
  repoPath: string,
  source: TrunkSyncSource,
  options: GitRuntimeOptions
): Promise<FetchedTrunkSource> {
  const ref = `${source.remoteName}/${source.branchName}`
  const execOptions = {
    ...gitOptionsForWorktree(repoPath, options),
    timeout: TRUNK_SYNC_TIMEOUT_MS
  }
  postponeRepoRefMaintenance()
  return withRepoRefMaintenancePaused('git-fetch', async () => {
    await gitExecFileAsync(
      [
        'fetch',
        '--no-tags',
        '--',
        source.remoteName,
        `+${branchFullRef(source.branchName)}:${source.trackingRef}`
      ],
      { ...execOptions, terminationBarrier: true }
    )
    const { stdout } = await gitExecFileAsync(
      ['rev-parse', '--verify', `${source.trackingRef}^{commit}`],
      execOptions
    )
    return { ref, commit: SourceCommit.parse(stdout.trim()) }
  })
}

export async function readTrunkCheckout(exec: TrunkGitExec): Promise<TrunkCheckoutState> {
  const ref = (await exec(['rev-parse', '--symbolic-full-name', 'HEAD'])).stdout.trim()
  if (!ref.startsWith('refs/heads/')) {
    throw new Error('工作树未检出本地分支')
  }
  const head = (await exec(['rev-parse', '--verify', 'HEAD^{commit}'])).stdout.trim()
  return { branch: ref.slice('refs/heads/'.length), head: SourceCommit.parse(head) }
}

export async function compareTrunk(
  exec: TrunkGitExec,
  head: string,
  trunk: string
): Promise<{ behind: number; ahead: number }> {
  const { stdout } = await exec(['rev-list', '--left-right', '--count', `${head}...${trunk}`])
  const counts = parseGitRevListAheadBehindCounts(stdout)
  if (counts.status !== 'ok') {
    throw new Error('无法读取本地分支与主干的提交差异')
  }
  return { ahead: counts.ahead, behind: counts.behind }
}

export type TrunkRefusalReason = 'branch-mismatch' | 'dirty-trunk' | 'ahead-trunk'

export type TrunkUpdateDecision =
  | { action: 'fast-forward'; behind: number }
  | { action: 'current' }
  | { action: 'refuse'; reason: TrunkRefusalReason }

export function decideTrunkUpdate(input: {
  branch: string
  baselineBranch: string
  dirty: boolean
  behind: number
  ahead: number
}): TrunkUpdateDecision {
  if (input.branch !== input.baselineBranch) {
    return { action: 'refuse', reason: 'branch-mismatch' }
  }
  if (input.dirty) {
    return { action: 'refuse', reason: 'dirty-trunk' }
  }
  if (input.ahead > 0) {
    return { action: 'refuse', reason: 'ahead-trunk' }
  }
  return input.behind > 0 ? { action: 'fast-forward', behind: input.behind } : { action: 'current' }
}

export function trunkRefusalSentence(
  reason: TrunkRefusalReason,
  context: { branch: string; baselineBranch: string; ahead: number }
): string {
  const { branch, baselineBranch, ahead } = context
  const cause =
    reason === 'branch-mismatch'
      ? `主检出当前在 ${branch} 分支，与基线 ${baselineBranch} 不一致`
      : reason === 'dirty-trunk'
        ? '主检出有未提交修改'
        : `主检出有 ${ahead} 个未合入基线的本地提交`
  return `代码未更新（${cause}）。请让会话模型处理 ${branch} 分支的代码更新。`
}
