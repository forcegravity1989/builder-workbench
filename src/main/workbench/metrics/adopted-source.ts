import { gitExecFileAsync } from '../../git/runner'
import { resolveGitRemoteRebaseSource } from '../../../shared/git-rebase-source'
import type { GitWorktreeExecOptions } from '../../git/worktree-operation-options'
import { resolveAdoptedBaseline } from '../history-git-core'

const syncing = new Map<string, Promise<unknown>>()

export async function adoptedMetricsSource(
  repoPath: string,
  adoptedRef: string | null,
  options: GitWorktreeExecOptions,
  synchronize = false
) {
  const exec = (args: string[]) =>
    gitExecFileAsync(args, { ...options, cwd: repoPath, timeout: 60_000 })
  const baseline = await resolveAdoptedBaseline(exec, adoptedRef)
  let ref = (await exec(['rev-parse', '--symbolic-full-name', baseline.ref])).stdout.trim()
  if (ref.startsWith('refs/heads/')) {
    const upstream = (await exec(['for-each-ref', '--format=%(upstream)', ref])).stdout.trim()
    if (upstream.startsWith('refs/remotes/')) {
      ref = upstream
    }
  }
  if (!ref.startsWith('refs/remotes/')) {
    return baseline
  }
  const source = await resolveGitRemoteRebaseSource(exec, ref)
  if (synchronize) {
    const key = JSON.stringify([repoPath, options.wslDistro, ref])
    let pending = syncing.get(key)
    if (!pending) {
      // Fetch only the adopted remote ref; never merge or reset a user's checkout.
      pending = exec([
        'fetch',
        '--no-tags',
        '--',
        source.remoteName,
        `+refs/heads/${source.branchName}:${ref}`
      ])
      syncing.set(key, pending)
    }
    try {
      await pending
    } finally {
      if (syncing.get(key) === pending) {
        syncing.delete(key)
      }
    }
  }
  return resolveAdoptedBaseline(exec, ref)
}
