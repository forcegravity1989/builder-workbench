import { gitExecFileAsync } from '../git/runner'
import { gitOptionsForWorktree, type GitRuntimeOptions } from '../git/git-runtime-options'
import { SourceCommit } from '../../shared/workbench/version-material'
import { HistorySourceError } from './version-history-snapshot'

export type TrunkGitExec = (argv: string[]) => Promise<{ stdout: string }>

export type TrunkSyncTarget = { remoteName: string; branchName: string; trackingRef?: string }

export type TrunkBaseline = {
  /** Display ref: the pinned short form, or the main checkout's branch name. */
  ref: string
  /** Full commit SHA of the trunk baseline at read time. */
  commit: string
  /** Remote branch the sync commands target; null when the baseline is not a syncable branch. */
  sync: TrunkSyncTarget | null
}

function matchRefPattern(pattern: string, ref: string): string | null {
  const wildcard = pattern.indexOf('*')
  if (wildcard === -1) {
    return pattern === ref ? '' : null
  }
  const prefix = pattern.slice(0, wildcard)
  const suffix = pattern.slice(wildcard + 1)
  return ref.startsWith(prefix) &&
    ref.endsWith(suffix) &&
    ref.length >= prefix.length + suffix.length
    ? ref.slice(prefix.length, ref.length - suffix.length)
    : null
}

/** Follow the configured fetch mapping for an exact remote-tracking ref. */
export function trunkSyncTargetFromSymbolic(
  symbolic: string,
  fetchConfig = ''
): TrunkSyncTarget | null {
  const ref = symbolic.trim()
  if (ref.startsWith('refs/heads/')) {
    return { remoteName: 'origin', branchName: ref.slice('refs/heads/'.length) }
  }
  if (!ref.startsWith('refs/remotes/')) {
    return null
  }

  const mappings = fetchConfig.split('\0').flatMap((entry) => {
    const match = /^remote\.(.+)\.fetch\n(.+)$/s.exec(entry)
    return match ? [{ remote: match[1], spec: match[2].trim() }] : []
  })
  const matches = new Map<string, TrunkSyncTarget>()
  for (const { remote, spec } of mappings) {
    const [source, destination] = spec.replace(/^\+/, '').split(':')
    if (!source.startsWith('refs/heads/') || !destination) {
      continue
    }
    const capture = matchRefPattern(destination, ref)
    if (capture === null) {
      continue
    }
    const sourceRef = source.replace('*', () => capture)
    if (
      mappings.some(
        (mapping) =>
          mapping.remote === remote &&
          mapping.spec.startsWith('^') &&
          matchRefPattern(mapping.spec.slice(1), sourceRef) !== null
      )
    ) {
      continue
    }
    matches.set(`${remote}\0${sourceRef}`, {
      remoteName: remote,
      branchName: sourceRef.slice('refs/heads/'.length),
      trackingRef: ref
    })
  }
  return matches.size === 1 ? ([...matches.values()][0] ?? null) : null
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
    const fetchConfig = symbolic.startsWith('refs/remotes/')
      ? await exec(['config', '--null', '--get-regexp', '^remote\\..*\\.fetch$']).then(
          ({ stdout }) => stdout,
          () => ''
        )
      : ''
    return {
      ref: trunkDisplayRef(symbolic, pin),
      commit,
      sync: trunkSyncTargetFromSymbolic(symbolic, fetchConfig)
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
