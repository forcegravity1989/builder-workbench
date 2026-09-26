import { resolveDefaultBaseRefViaExec, type GitExec } from '../git/repo-default-base-ref'
import { gitExecFileAsync, gitExecFileAsyncBuffer } from '../git/runner'
import {
  gitOptionsForWorktree,
  gitReadOptionsForWorktree,
  type GitRuntimeOptions
} from '../git/git-runtime-options'
import { DEFAULT_GIT_MAX_BUFFER } from '../git/command-runner/git-exec-options'
import { extractExecError } from '../git/exec-error'
import { SourceCommit } from '../../shared/workbench/version-material'
import { HistorySourceError } from './version-history-snapshot'

/**
 * Resolves the project's adopted history source: the explicitly registered base
 * ref first, otherwise the native default-branch probes. The result is pinned to
 * a full commit SHA. A registered ref that no longer resolves is an error — the
 * adopted source never silently switches to another branch.
 */
export async function resolveAdoptedBaseline(
  exec: GitExec,
  adoptedRef: string | null
): Promise<{ ref: string; commit: string }> {
  let ref = adoptedRef?.trim() || null
  if (!ref) {
    ref = await resolveDefaultBaseRefViaExec(exec)
  }
  if (!ref) {
    throw new HistorySourceError(
      'baseline-unresolved',
      '无法解析项目采用分支，请先在项目设置明确基线'
    )
  }
  let commit: string
  try {
    commit = (await exec(['rev-parse', '--verify', `${ref}^{commit}`])).stdout.trim()
  } catch {
    throw new HistorySourceError(
      'baseline-invalid',
      `项目采用来源 ${ref} 已失效；不改用其他分支读取历史`
    )
  }
  SourceCommit.parse(commit)
  return { ref, commit }
}

const SHA = '(?:[a-f0-9]{40}|[a-f0-9]{64})'
const MATERIAL_PATH = String.raw`\.bw\/planning\/[^/\0]+\/(?:data|acceptance)\.json`

/**
 * Exact read-only argv allowlists the history service issues. The SSH relay accepts
 * nothing else: provider.exec lacks show/worktree/reset and stays that way, so
 * this narrow executor is the only remote Git surface and re-derives the whole
 * allowlist from the request instead of trusting the caller. Baseline resolution
 * runs as its own relay operation through resolveAdoptedBaseline, not via this
 * allowlist.
 */
export function assertReadOnlyHistoryGitArgs(args: readonly string[]): void {
  const invalid = () => {
    throw new HistorySourceError('invalid-git-request', '远端历史读取只接受固定的只读 Git 命令')
  }
  switch (args[0]) {
    case 'log': {
      const logArgvPrefix = [
        'log',
        '-z',
        '--full-history',
        '--diff-merges=first-parent',
        '--format=%H%x00%cI',
        '--name-only',
        '--diff-filter=AM',
        '--no-renames'
      ]
      if (
        args.length !== logArgvPrefix.length + 3 ||
        logArgvPrefix.some((token, index) => args[index] !== token) ||
        !new RegExp(`^${SHA}$`).test(args[logArgvPrefix.length]) ||
        args[logArgvPrefix.length + 1] !== '--' ||
        args[logArgvPrefix.length + 2] !== '.bw/planning'
      ) {
        invalid()
      }
      return
    }
    case 'show': {
      if (args.length !== 2 || !new RegExp(`^${SHA}:${MATERIAL_PATH}$`).test(args[1])) {
        invalid()
      }
      return
    }
    case 'merge-base': {
      if (
        args.length !== 4 ||
        args[1] !== '--is-ancestor' ||
        !args.slice(2).every((token) => new RegExp(`^${SHA}$`).test(token))
      ) {
        invalid()
      }
      return
    }
    default:
      invalid()
  }
}

export type HistoryGitOutcome =
  | { ok: true; stdout: Buffer }
  | { ok: false; code: string; message: string; exitCode: number | null }

/** Exit code 128 is Git's "object/path not there"; the byte proof maps it to absence. */
export function historyGitFailure(error: unknown): {
  code: string
  message: string
  exitCode: number | null
} {
  if (error instanceof HistorySourceError) {
    return { code: error.code, message: error.message, exitCode: null }
  }
  const raw = (error as { code?: unknown } | null)?.code
  const { stderr } = extractExecError(error)
  return {
    code: 'git-failed',
    message: stderr.trim().slice(-400) || (error instanceof Error ? error.message : String(error)),
    exitCode: typeof raw === 'number' ? raw : null
  }
}

/** The one read-only Git executor both the local host and the SSH relay run. */
export async function runReadOnlyHistoryGit(
  repoPath: string,
  args: readonly string[],
  options: GitRuntimeOptions = {}
): Promise<HistoryGitOutcome> {
  try {
    assertReadOnlyHistoryGitArgs(args)
    const { stdout } = await gitExecFileAsyncBuffer([...args], {
      ...gitReadOptionsForWorktree(repoPath, options),
      maxBuffer: DEFAULT_GIT_MAX_BUFFER
    })
    return { ok: true, stdout }
  } catch (error) {
    return { ok: false, ...historyGitFailure(error) }
  }
}

/** Resolves the adopted baseline where the repository filesystem actually lives. */
export function runAdoptedBaseline(
  repoPath: string,
  adoptedRef: string | null,
  options: GitRuntimeOptions = {}
): Promise<{ ref: string; commit: string }> {
  const exec: GitExec = (argv) =>
    gitExecFileAsync(argv, {
      ...gitOptionsForWorktree(repoPath, options),
      timeout: 30_000
    })
  return resolveAdoptedBaseline(exec, adoptedRef)
}
