import { gitExecFileAsyncBuffer } from '../git/runner'
import { gitReadOptionsForWorktree, type GitRuntimeOptions } from '../git/git-runtime-options'
import { DEFAULT_GIT_MAX_BUFFER } from '../git/command-runner/git-exec-options'
import { extractExecError } from '../git/exec-error'
import { HistorySourceError } from './version-history-snapshot'
import { planEntryLogArgs, versionHistoryLogArgs } from './version-history-log'

const SHA = '(?:[a-f0-9]{40}|[a-f0-9]{64})'
const MATERIAL_PATH = String.raw`\.bw\/planning\/(?!\.+$)[^/\0]+\/(?:data|acceptance)\.json`

/**
 * Exact read-only argv allowlists the history service issues. The SSH relay accepts
 * nothing else: provider.exec lacks show/worktree/reset and stays that way, so
 * this narrow executor is the only remote Git surface and re-derives the whole
 * allowlist from the request instead of trusting the caller. Baseline resolution
 * runs as its own relay operation through runTrunkBaseline (trunk-baseline.ts),
 * not via this allowlist.
 */
export function assertReadOnlyHistoryGitArgs(args: readonly string[]): void {
  const invalid = () => {
    throw new HistorySourceError('invalid-git-request', '远端历史读取只接受固定的只读 Git 命令')
  }
  switch (args[0]) {
    case 'log': {
      if (
        args.length === 6 &&
        args[1] === '-1' &&
        args[2] === '--format=%H' &&
        new RegExp(`^${SHA}$`).test(args[3]) &&
        args[4] === '--' &&
        new RegExp(`^${MATERIAL_PATH}$`).test(args[5])
      ) {
        return
      }
      const commit = args.at(-3) ?? ''
      const allowed =
        args[2] === '--no-merges'
          ? planEntryLogArgs(commit, args[3] === '--min-parents=1')
          : versionHistoryLogArgs(commit)
      if (
        !new RegExp(`^${SHA}$`).test(commit) ||
        args.length !== allowed.length ||
        allowed.some((token, index) => args[index] !== token)
      ) {
        invalid()
      }
      return
    }
    case 'show': {
      if (
        args.length === 4 &&
        args[1] === '-s' &&
        args[2] === '--format=%cI' &&
        new RegExp(`^${SHA}$`).test(args[3])
      ) {
        return
      }
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
    case 'rev-parse': {
      if (args.length !== 2 || (args[1] !== 'HEAD' && args[1] !== '--is-shallow-repository')) {
        invalid()
      }
      return
    }
    case 'ls-tree': {
      if (
        args.length === 7 &&
        args[1] === '-r' &&
        args[2] === '-z' &&
        args[3] === '--name-only' &&
        new RegExp(`^${SHA}$`).test(args[4]) &&
        args[5] === '--' &&
        args[6] === '.bw/planning'
      ) {
        return
      }
      if (
        args.length !== 4 ||
        args[1] !== '-z' ||
        args[2] !== '--name-only' ||
        !new RegExp(`^${SHA}:\\.bw/planning$`).test(args[3])
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
      maxBuffer: DEFAULT_GIT_MAX_BUFFER,
      timeout: args[0] === 'log' && args[2] === '--no-merges' ? 5_000 : undefined
    })
    return { ok: true, stdout }
  } catch (error) {
    return { ok: false, ...historyGitFailure(error) }
  }
}
