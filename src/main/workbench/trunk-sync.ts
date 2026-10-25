import { gitExecFileAsync } from '../git/runner'
import {
  gitOptionsForWorktree,
  gitReadOptionsForWorktree,
  type GitRuntimeOptions
} from '../git/git-runtime-options'
import {
  postponeRepoRefMaintenance,
  withRepoRefMaintenancePaused
} from '../git/local-repo-ref-maintenance'
import type { TrunkSyncTarget } from './trunk-baseline'
import { branchFullRef } from '../../shared/workbench/branch-ref'

/** A user-clicked sync must fail honestly rather than hang the screen. */
export const TRUNK_SYNC_TIMEOUT_MS = 60_000

const READ_TIMEOUT_MS = 30_000

export function trunkRemoteRef(target: TrunkSyncTarget): string {
  return `${target.remoteName}/${target.branchName}`
}

/**
 * Fetches only the trunk bookmark: updates `refs/remotes/<r>/<b>` and downloads
 * its objects, never touches any working file. Runs at the main checkout — the
 * fixed trees share the same object store and refs.
 */
export async function fetchTrunkBookmark(
  repoPath: string,
  target: TrunkSyncTarget,
  options: GitRuntimeOptions = {}
): Promise<void> {
  const bookmark = `refs/remotes/${trunkRemoteRef(target)}`
  // Same ref-maintenance window as the native fetch: an idle pack rewriting
  // packed-refs (~1.4s) must not make the bookmark update fail on the lock.
  postponeRepoRefMaintenance()
  await withRepoRefMaintenancePaused('git-fetch', async () => {
    await gitExecFileAsync(
      [
        'fetch',
        '--no-tags',
        '--',
        target.remoteName,
        `+${branchFullRef(target.branchName)}:${bookmark}`
      ],
      { ...gitOptionsForWorktree(repoPath, options), timeout: TRUNK_SYNC_TIMEOUT_MS }
    )
  })
}

export type TrunkComparison = { behind: number; ahead: number }

/** Two read-only counts: how far a tree lags behind / leads the fetched bookmark. */
export async function compareTrunk(
  treePath: string,
  target: TrunkSyncTarget,
  options: GitRuntimeOptions = {}
): Promise<TrunkComparison> {
  const remoteRef = trunkRemoteRef(target)
  const count = async (range: string) => {
    const { stdout } = await gitExecFileAsync(['rev-list', '--count', range], {
      ...gitReadOptionsForWorktree(treePath, options),
      timeout: READ_TIMEOUT_MS
    })
    return Number.parseInt(stdout.trim(), 10) || 0
  }
  return {
    behind: await count(`HEAD..${remoteRef}`),
    ahead: await count(`${remoteRef}..HEAD`)
  }
}

export type TrunkCheckoutState = { branch: string; dirty: boolean }

/**
 * Guard inputs of the main checkout: its current branch and whether tracked
 * files carry uncommitted modifications. Untracked files never block a
 * fast-forward and are none of the sync's business.
 */
export async function readTrunkCheckoutState(
  repoPath: string,
  options: GitRuntimeOptions = {}
): Promise<TrunkCheckoutState> {
  const read = async (argv: string[]) =>
    (
      await gitExecFileAsync(argv, {
        ...gitReadOptionsForWorktree(repoPath, options),
        timeout: READ_TIMEOUT_MS
      })
    ).stdout
  const branch = (await read(['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  const status = (await read(['status', '--porcelain', '--untracked-files=no'])).trim()
  return { branch, dirty: status.length > 0 }
}

/** Full SHA a tree currently points at. */
export async function readTreeHead(
  treePath: string,
  options: GitRuntimeOptions = {}
): Promise<string> {
  const { stdout } = await gitExecFileAsync(['rev-parse', 'HEAD'], {
    ...gitReadOptionsForWorktree(treePath, options),
    timeout: READ_TIMEOUT_MS
  })
  return stdout.trim()
}

export type TrunkRefusalReason = 'branch-mismatch' | 'dirty-trunk' | 'ahead-trunk' | 'diverged'

export type TrunkUpdateDecision =
  | { action: 'fast-forward'; behind: number }
  | { action: 'current' }
  | { action: 'refuse'; reason: TrunkRefusalReason }

/**
 * The one decision table behind every「更新代码」button. The main checkout must
 * be a clean mirror sitting on the baseline branch — local commits or edits are
 * the user's, so the button refuses instead of fast-forwarding them away. A
 * cycle tree may carry draft commits (that is its job); only divergence —
 * unmerged work while the trunk moved on — blocks its fast-forward. A pure
 * draft state is normal and stays silent.
 */
export function decideTrunkUpdate(input: {
  isTrunkCheckout: boolean
  /** Current branch of the target tree (cycle trees sit on bw/* by design). */
  branch: string
  baselineBranch: string
  /** Tracked-file modifications; only consulted for the main checkout. */
  dirty: boolean
  behind: number
  ahead: number
}): TrunkUpdateDecision {
  if (input.isTrunkCheckout) {
    if (input.branch !== input.baselineBranch) {
      return { action: 'refuse', reason: 'branch-mismatch' }
    }
    if (input.dirty) {
      return { action: 'refuse', reason: 'dirty-trunk' }
    }
    if (input.ahead > 0) {
      return { action: 'refuse', reason: 'ahead-trunk' }
    }
    return input.behind > 0
      ? { action: 'fast-forward', behind: input.behind }
      : { action: 'current' }
  }
  if (input.behind > 0 && input.ahead > 0) {
    return { action: 'refuse', reason: 'diverged' }
  }
  return input.behind > 0 ? { action: 'fast-forward', behind: input.behind } : { action: 'current' }
}

/**
 * The unified refusal sentence (user-settled wording): one line of cause plus
 * the one next step — hand the branch that actually needs work (the target
 * tree's own branch) to the session model. Never a stack of git output.
 */
export function trunkRefusalSentence(
  reason: TrunkRefusalReason,
  context: { branch: string; baselineBranch: string; behind: number; ahead: number }
): string {
  const { branch, baselineBranch, behind, ahead } = context
  const cause =
    reason === 'branch-mismatch'
      ? `主检出当前在 ${branch} 分支，与基线 ${baselineBranch} 不一致`
      : reason === 'dirty-trunk'
        ? '主检出有未提交修改'
        : reason === 'ahead-trunk'
          ? `主检出有 ${ahead} 个未合入基线的本地提交`
          : `工作树有 ${ahead} 个未合入提交、主干新增 ${behind} 个，已分叉`
  return `代码未更新（${cause}）。请让会话模型处理 ${branch} 分支的代码更新。`
}
