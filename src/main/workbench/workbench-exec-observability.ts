import { posix, win32 } from 'node:path'
import { withSpan, type ActiveSpan } from '../observability/tracer'
import { extractExecError } from '../git/exec-error'
import { commandExecFileAsync } from '../git/command-runner/command-exec-file'
import type { CommandExecOptions } from '../git/command-runner/spawn-command-capture'
import { ghExecFileAsync, type GhExecOptions } from '../git/command-runner/gh-exec-file'
import { isAbortError, safeLabel, traceStderrTail } from './workbench-trace-details'

type ExecResult = { stdout: string; stderr: string }

export function collectorInterpreterLabel(program: string): string {
  const basename = program.includes('\\') ? win32.basename(program) : posix.basename(program)
  return safeLabel(basename.toLowerCase(), 'other')
}

function cbShimExitCode(error: unknown): number | undefined {
  if (!(error instanceof Error)) {
    return undefined
  }
  // spawnCommandCapture exposes the batch shim's exit code only in its own message.
  const match = /^(?:[^\r\n]+[/\\])?cb\.(?:cmd|bat) exited with (-?\d+)\.$/i.exec(error.message)
  return match ? Number(match[1]) : undefined
}

export function hasTruncatedExecOutput(error: unknown): boolean {
  return (
    error instanceof Error &&
    (('code' in error && error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') ||
      /(?: (?:stdout|stderr) exceeded maxBuffer| produced more than \d+ bytes of output)\.$/.test(
        error.message
      ))
  )
}

function recordExecFailure(span: ActiveSpan, error: unknown, command: 'gh' | 'cb'): void {
  const fields =
    error !== null && typeof error === 'object'
      ? (error as { code?: unknown; killed?: unknown; stderr?: unknown; timedOut?: unknown })
      : {}
  const code =
    typeof fields.code === 'number'
      ? fields.code
      : command === 'cb'
        ? cbShimExitCode(error)
        : undefined
  const timedOut =
    fields.timedOut === true ||
    (error instanceof Error &&
      code === undefined &&
      (command === 'cb' || (fields.killed === true && fields.code === null)) &&
      error.message.endsWith(' timed out.'))
  const outputTruncated = hasTruncatedExecOutput(error)
  span.setAttribute('status', 'failed')
  if (code !== undefined) {
    span.setAttribute('exitCode', code)
  }
  if (timedOut) {
    span.setAttribute('timedOut', true)
  }
  if (fields.killed === true) {
    span.setAttribute('killed', true)
  }
  if (outputTruncated) {
    span.setAttribute('outputTruncated', true)
  }
  // The native redactor needs complete credential markers. execFile messages can also contain argv.
  const stderr =
    !outputTruncated && fields.stderr ? traceStderrTail(extractExecError(error).stderr) : ''
  let summary = `${command} failed`
  if (timedOut) {
    summary = `${command} timed out`
  } else if (outputTruncated) {
    summary = `${command} output truncated`
  } else if (code !== undefined) {
    summary = `${command} exited ${code}`
  } else if (fields.code === 'ENOENT') {
    summary = `${command} not found`
  }
  span.fail(stderr ? `${summary}: ${stderr}` : summary)
}

function withExecSpan(
  command: 'gh' | 'cb',
  attributes: Record<string, unknown>,
  run: () => Promise<ExecResult>
): Promise<ExecResult> {
  return withSpan(
    command === 'gh' ? 'workbench.gh.exec' : 'workbench.cli.exec',
    async (span) => {
      try {
        return await run()
      } catch (error) {
        if (isAbortError(error)) {
          span.interrupt('workbench-exec-cancelled')
        } else {
          recordExecFailure(span, error, command)
        }
        throw error
      }
    },
    { kind: 'client', attributes }
  )
}

export function bwGhExecFileAsync(
  args: string[],
  options: GhExecOptions = {}
): Promise<ExecResult> {
  return withExecSpan(
    'gh',
    {
      'gh.subcommand': safeLabel(args[0], 'unknown'),
      'gh.arg_count': args.length,
      ...(options.cwd ? { cwd: options.cwd } : {})
    },
    () => ghExecFileAsync(args, options)
  )
}

export function bwCbExecFileAsync(
  args: string[],
  options: CommandExecOptions = {}
): Promise<ExecResult> {
  return withExecSpan(
    'cb',
    {
      'cli.name': 'cb',
      'cli.arg_count': args.length,
      ...(options.cwd ? { cwd: options.cwd } : {})
    },
    () => commandExecFileAsync('cb', args, options)
  )
}
