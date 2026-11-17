import { resolveDefaultBaseRefViaExec } from '../git/repo'
import { resolveWorktreeCreateBase } from '../worktree-create-base'
import { WorkspaceScopeError } from './workspace-scope-error'
import { resolveWorktreeAddBaseRef } from '../../shared/worktree/base-ref'
import { hasCommitObjectViaGitExec } from '../git/commit-object-ref'

export type FixedWorkspaceGit = {
  exec(args: string[]): Promise<{ stdout: string }>
  fetch(remote: string, branch: string, ref: string): Promise<void>
  ensureTracking(remote: string, branch: string, expectedHead: string): Promise<void>
  recordCreation(branch: string, source: string, expectedHead: string): Promise<void>
}

/** Exact reads bypass catalog/ref caches, including a failed creation's surviving local ref. */
export async function readFixedBranch(
  git: FixedWorkspaceGit,
  branch: string
): Promise<string | null> {
  const ref = `refs/heads/${branch}`
  const { stdout } = await git.exec(['for-each-ref', '--format=%(refname) %(objectname)', ref])
  const match = stdout
    .split('\n')
    .map((line) => line.trim().split(' '))
    .find(([name]) => name === ref)
  return match?.[1] ?? null
}

/** Materialize a local branch without overwriting any existing ref or consulting a forge. */
export async function ensureFixedBranch(
  git: FixedWorkspaceGit,
  branch: string,
  configuredBase?: string | null
): Promise<{ compareBaseRef?: string }> {
  await git.exec(['check-ref-format', '--branch', branch])
  const refExists = async (ref: string) => {
    try {
      return (
        (await git.exec(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])).stdout.trim()
          .length > 0
      )
    } catch {
      return false
    }
  }
  const baseline = async () => {
    const base = await resolveWorktreeCreateBase({
      repoWorktreeBaseRef: configuredBase,
      resolveDefaultBaseRef: () => resolveDefaultBaseRefViaExec((args) => git.exec(args)),
      isBaseUsable: async (ref) => {
        const resolved = await resolveWorktreeAddBaseRef(ref, refExists)
        return (
          resolved !== ref ||
          (ref.startsWith('refs/')
            ? refExists(ref)
            : hasCommitObjectViaGitExec((args) => git.exec(args), ref))
        )
      }
    })
    return base ? resolveWorktreeAddBaseRef(base, refExists) : undefined
  }
  const localComparison = async () => {
    try {
      const base = (await git.exec(['config', '--get', `branch.${branch}.base`])).stdout.trim()
      if (base) {
        return { compareBaseRef: base }
      }
    } catch {
      /* Existing branches can predate creation-base metadata. */
    }
    try {
      const upstream = (
        await git.exec(['rev-parse', '--symbolic-full-name', `${branch}@{upstream}`])
      ).stdout.trim()
      if (upstream.startsWith('refs/remotes/')) {
        return { compareBaseRef: upstream }
      }
    } catch {
      /* Unpublished local branches have no upstream. */
    }
    return { compareBaseRef: await baseline() }
  }
  if (await readFixedBranch(git, branch)) {
    return localComparison()
  }
  const remotes = (await git.exec(['remote'])).stdout
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean)
  if (remotes.some((remote) => remote.startsWith('-'))) {
    throw new WorkspaceScopeError('branch-source-unavailable', '项目远端名称无效，请核对后重试')
  }
  const headRef = `refs/heads/${branch}`
  const probes = await Promise.allSettled(
    remotes.map(async (remote) => {
      const result = await git.exec(['ls-remote', '--heads', remote, headRef])
      const match = result.stdout
        .split('\n')
        .map((line) => line.trim().split(/\s+/))
        .find(([, ref]) => ref === headRef)
      return match ? { remote, oid: match[0] } : null
    })
  )
  if (probes.some((probe) => probe.status === 'rejected')) {
    throw new WorkspaceScopeError(
      'branch-source-unavailable',
      `无法核实远端是否存在分支 ${branch}，请检查连接或权限后重试`
    )
  }
  const sources = probes.flatMap((probe) =>
    probe.status === 'fulfilled' && probe.value ? [probe.value] : []
  )
  if (sources.length > 1) {
    throw new WorkspaceScopeError(
      'branch-ambiguous',
      `多个远端存在分支 ${branch}，请先在项目中检出要使用的分支后重试`
    )
  }
  // Another process may have restored the branch during the network probes.
  if (await readFixedBranch(git, branch)) {
    return localComparison()
  }
  let source: string
  let track = false
  const remoteSource = sources[0]
  if (remoteSource) {
    source = `refs/remotes/${remoteSource.remote}/${branch}`
    await git.fetch(remoteSource.remote, branch, source)
    const fetched = (await git.exec(['rev-parse', '--verify', `${source}^{commit}`])).stdout.trim()
    if (fetched !== remoteSource.oid) {
      throw new WorkspaceScopeError(
        'branch-source-changed',
        `远端分支 ${branch} 在恢复期间发生变化，请重试`
      )
    }
    await git.ensureTracking(remoteSource.remote, branch, fetched)
    track = true
  } else {
    const base = await baseline()
    if (!base) {
      throw new WorkspaceScopeError('base-unavailable', '无法确定固定工作区的起点，请核对项目基线')
    }
    source = base
    const remoteBase = source.startsWith('refs/remotes/')
      ? source.slice('refs/remotes/'.length)
      : null
    const remote = [...remotes]
      .sort((a, b) => b.length - a.length)
      .find((name) => remoteBase?.startsWith(`${name}/`))
    if (remote) {
      const baseBranch = remoteBase!.slice(remote.length + 1)
      source = `refs/remotes/${remote}/${baseBranch}`
      await git.fetch(remote, baseBranch, source)
    }
  }
  try {
    await git.exec(['branch', track ? '--track' : '--no-track', branch, source])
  } catch (error) {
    // Git's no-force branch creation arbitrates cross-process races without resetting the winner.
    if (!(await readFixedBranch(git, branch))) {
      throw error
    }
    return localComparison()
  }
  const head = (await readFixedBranch(git, branch))!
  if (!track) {
    await git.recordCreation(branch, source, head)
  }
  return { compareBaseRef: source }
}
