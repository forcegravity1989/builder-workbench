import { gitExecFileAsync } from '../git/runner'
import { gitOptionsForWorktree, type GitRuntimeOptions } from '../git/git-runtime-options'
import { SourceCommit } from '../../shared/workbench/version-material'
import { HistorySourceError } from './version-history-snapshot'

export type TrunkGitExec = (argv: string[]) => Promise<{ stdout: string }>

export type TrunkSyncTarget = { remoteName: string; branchName: string }

export type TrunkBaseline = {
  /** Display ref: the pinned short form, or the main checkout's branch name. */
  ref: string
  /** Full commit SHA of the trunk baseline at read time. */
  commit: string
  /** Remote branch the sync commands target; null when the baseline is not a syncable branch. */
  sync: TrunkSyncTarget | null
}

/**
 * Maps `rev-parse --symbolic-full-name` output to a sync target. Only real
 * branches can be fetched and fast-forwarded: a remote-tracking ref keeps its
 * own remote; a local branch assumes origin carries the same branch name (a
 * missing one makes the fetch fail honestly); anything else — a commit id, a
 * tag — stays readable but not syncable.
 */
export function trunkSyncTargetFromSymbolic(symbolic: string): TrunkSyncTarget | null {
  const ref = symbolic.trim()
  const remote = /^refs\/remotes\/([^/]+)\/(.+)$/.exec(ref)
  if (remote) {
    return { remoteName: remote[1], branchName: remote[2] }
  }
  const head = /^refs\/heads\/(.+)$/.exec(ref)
  if (head) {
    return { remoteName: 'origin', branchName: head[1] }
  }
  return null
}

/** The short display form of a resolved symbolic ref; the pin itself when it is not a branch. */
export function trunkDisplayRef(symbolic: string, pinned: string): string {
  const ref = symbolic.trim()
  if (ref.startsWith('refs/remotes/')) {
    return ref.slice('refs/remotes/'.length)
  }
  if (ref.startsWith('refs/heads/')) {
    return ref.slice('refs/heads/'.length)
  }
  return pinned
}

/**
 * The one trunk baseline of a project: the pinned `worktreeBaseRef` when the
 * repo settings carry one, otherwise the branch the main checkout currently
 * sits on. Never a guessed name — an unresolvable baseline is an honest error,
 * and a pinned ref that no longer resolves never silently switches to another
 * branch.
 */
export async function resolveTrunkBaseline(
  exec: TrunkGitExec,
  pinnedRef: string | null
): Promise<TrunkBaseline> {
  const pin = pinnedRef?.trim() || null
  if (pin) {
    let commit: string
    try {
      commit = (await exec(['rev-parse', '--verify', `${pin}^{commit}`])).stdout.trim()
    } catch {
      throw new HistorySourceError(
        'baseline-invalid',
        `项目基线 ${pin} 已失效；不改用其他分支读取历史`
      )
    }
    let symbolic = ''
    try {
      symbolic = (await exec(['rev-parse', '--symbolic-full-name', pin])).stdout.trim()
    } catch {
      symbolic = ''
    }
    SourceCommit.parse(commit)
    return {
      ref: trunkDisplayRef(symbolic, pin),
      commit,
      sync: trunkSyncTargetFromSymbolic(symbolic)
    }
  }
  let branch = ''
  try {
    branch = (await exec(['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim()
  } catch {
    branch = ''
  }
  if (!branch || branch === 'HEAD') {
    throw new HistorySourceError(
      'baseline-unresolved',
      '主检出不在任何分支上，无法确定主干基线；请在项目设置钉定基线分支'
    )
  }
  let commit: string
  try {
    commit = (await exec(['rev-parse', 'HEAD'])).stdout.trim()
  } catch {
    throw new HistorySourceError('baseline-unresolved', '无法读取主检出 HEAD；请核对项目仓库状态')
  }
  SourceCommit.parse(commit)
  return { ref: branch, commit, sync: { remoteName: 'origin', branchName: branch } }
}

/** Resolves the trunk baseline where the repository filesystem actually lives. */
export function runTrunkBaseline(
  repoPath: string,
  pinnedRef: string | null,
  options: GitRuntimeOptions = {}
): Promise<TrunkBaseline> {
  const exec: TrunkGitExec = (argv) =>
    gitExecFileAsync(argv, {
      ...gitOptionsForWorktree(repoPath, options),
      timeout: 30_000
    })
  return resolveTrunkBaseline(exec, pinnedRef)
}
