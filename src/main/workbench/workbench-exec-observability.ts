// BW subprocess exec wrappers with troubleshooting spans (Issue #553 第二件
// B 档). The eleven previously invisible BW call sites (gh ×8, cb ×1,
// metrics collector runProcess/runWslProcess ×2) now record command name /
// subcommand / arg count / cwd / exit code / timeout flags; stderr and error
// chains travel only in the redacted `exit.cause` via the native withSpan
// failure path.
//
// Attribute policy mirrors A 档 and the native git.exec precedent
// (instrumentation.ts): closed vocabulary only — never argument values,
// prompts, or free text in attributes. `kind: 'client'` marks outbound CLI
// calls so they filter apart from A 档's server-side RPC spans, and ALS
// context nests them under the enclosing workbench.* operation span.

import { basename } from 'node:path'
import { withSpan, type ActiveSpan } from '../observability/tracer'
import { commandExecFileAsync } from '../git/command-runner/command-exec-file'
import type { CommandExecOptions } from '../git/command-runner/spawn-command-capture'
import { ghExecFileAsync, type GhExecOptions } from '../git/command-runner/gh-exec-file'

export type BwExecResult = { stdout: string; stderr: string }

// Same shape as the skill-observability precedent: exec labels are stable
// machine tokens (subcommands, binary basenames), not paths or arguments.
const SAFE_LABEL = /^[a-z0-9][a-z0-9._-]{0,63}$/i

function safeLabel(value: string | undefined, fallback: string): string {
  return value && SAFE_LABEL.test(value) ? value : fallback
}

/** Interpreter basename only — collector programs are user-configured paths. */
export function collectorInterpreterLabel(program: string): string {
  return safeLabel(basename(program).toLowerCase(), 'other')
}

function recordExecFailure(span: ActiveSpan, error: unknown): void {
  span.setAttribute('status', 'failed')
  const code = (error as { code?: unknown }).code
  if (typeof code === 'number') {
    span.setAttribute('exitCode', code)
  }
  if ((error as { timedOut?: unknown }).timedOut === true) {
    span.setAttribute('timedOut', true)
  }
  if ((error as { killed?: unknown }).killed === true) {
    span.setAttribute('killed', true)
  }
}

/** BW-scoped `gh` calls (archive/release/charter/overview/package/workflow chains). */
export function bwGhExecFileAsync(
  args: string[],
  options: GhExecOptions = {}
): Promise<BwExecResult> {
  return withSpan(
    'workbench.gh.exec',
    async (span) => {
      span.setAttribute('gh.subcommand', safeLabel(args[0], 'unknown'))
      span.setAttribute('gh.arg_count', args.length)
      if (options.cwd) {
        span.setAttribute('cwd', options.cwd)
      }
      try {
        return await ghExecFileAsync(args, options)
      } catch (error) {
        recordExecFailure(span, error)
        throw error
      }
    },
    { kind: 'client' }
  )
}

/** BW-scoped fixed-binary calls (CloudDragon `cb`). */
export function bwCommandExecFileAsync(
  command: string,
  args: string[],
  options: CommandExecOptions = {}
): Promise<BwExecResult> {
  return withSpan(
    'workbench.cli.exec',
    async (span) => {
      span.setAttribute('cli.name', safeLabel(command, 'unknown'))
      span.setAttribute('cli.arg_count', args.length)
      if (options.cwd) {
        span.setAttribute('cwd', options.cwd)
      }
      try {
        return await commandExecFileAsync(command, args, options)
      } catch (error) {
        recordExecFailure(span, error)
        throw error
      }
    },
    { kind: 'client' }
  )
}
