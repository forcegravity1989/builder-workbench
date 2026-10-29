import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { buildPosixCommandPathLookupScript } from '../../shared/posix-command-path-lookup'
import { isCommandOnLocalPath, resolveCommandOnLocalPath } from './command-path-resolver'
import { buildLocalPreflightEnv } from './preflight-local-env'
import { runPreflightCommandInWsl } from './preflight-wsl-command'
import type { WslPreflightTarget } from './preflight-wsl-agent-detection'

const execFileAsync = promisify(execFile)
export const PREFLIGHT_COMMAND_TIMEOUT_MS = 5000
const WSL_COMMAND_PATH_SENTINEL = '__ORCA_PREFLIGHT_COMMAND_PATH__'

export type PreflightCommandResult = { stdout: string; stderr: string }

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

async function withPreflightTimeout<T>(
  command: string,
  commandPromise: Promise<T>,
  timeoutMs: number = PREFLIGHT_COMMAND_TIMEOUT_MS
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      commandPromise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          const error = Object.assign(new Error(`Timed out running ${command}`), {
            code: 'ETIMEDOUT'
          })
          reject(error)
        }, timeoutMs)
        if (typeof timeout.unref === 'function') {
          timeout.unref()
        }
      })
    ])
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}

/** Rejects on non-zero exit, spawn failure, or timeout — it never reports
 *  "absent" as a value. A caller that collapses that rejection into `false`
 *  makes "not installed" and "could not run it" the same answer; see
 *  docs/reference/wsl-probe-failure-semantics.md before doing so. */
export async function execLocalPreflightCommandOrThrow(
  command: string,
  args: string[],
  timeoutMs: number = PREFLIGHT_COMMAND_TIMEOUT_MS
): Promise<PreflightCommandResult> {
  const env = buildLocalPreflightEnv()
  // Why (BW #323): Windows CreateProcess only launches real executables, so a
  // bare execFile cannot see npm-installed CLIs whose global shims are .cmd
  // scripts — a freshly installed welink-cli / codehub-cli would keep reading
  // "not installed". Resolve against the same registry-merged PATH and route
  // .cmd/.bat shims through cmd.exe; every other resolution (real .exe, or
  // nothing found) keeps the bare spawn so existing probe semantics stay
  // byte-identical. normalize() turns the resolver's forward-slash joins into
  // the backslash form cmd.exe expects.
  const resolved =
    process.platform === 'win32' ? await resolveCommandOnLocalPath(command, { env }) : null
  const shimPath = resolved ? path.normalize(resolved) : null
  const commandPromise = (
    shimPath && /\.(cmd|bat)$/i.test(shimPath)
      ? execFileAsync('cmd.exe', ['/d', '/c', shimPath, ...args], {
          encoding: 'utf-8',
          timeout: timeoutMs,
          windowsHide: true,
          ...(env ? { env } : {})
        })
      : execFileAsync(command, args, {
          encoding: 'utf-8',
          timeout: timeoutMs,
          // Preflight probes console-subsystem binaries (git, gh, node); without this
          // each one flashes a console and steals foreground on Windows (#10488).
          windowsHide: true,
          ...(env ? { env } : {})
        })
  ) as Promise<PreflightCommandResult>

  return withPreflightTimeout(command, commandPromise, timeoutMs)
}

// Throws on any failure — a distro that is booting/unreachable throws the
// same way a command that genuinely doesn't exist does. Callers must not
// collapse both into "absent"; see docs/reference/wsl-probe-failure-semantics.md.
export async function execCommandInWslOrThrow(
  target: WslPreflightTarget,
  command: string
): Promise<PreflightCommandResult> {
  const commandPromise = runPreflightCommandInWsl(target, command, PREFLIGHT_COMMAND_TIMEOUT_MS)
  // Label only (runPreflightCommandInWsl owns the actual wsl.exe invocation) —
  // not the literal 'wsl.exe' so the wsl-invocation-boundary guard doesn't
  // mistake this string for a spawn site.
  return withPreflightTimeout('wsl command', commandPromise)
}

export async function isCommandAvailable(
  command: string,
  wslTarget?: WslPreflightTarget,
  // Why (BW #366): cloudbuild's cb rejects `--version` (cobra: unknown flag);
  // its `version` subcommand is the equivalent liveness probe. Callers pass
  // the args the CLI actually supports.
  versionArgs: string[] = ['--version']
): Promise<boolean> {
  try {
    await (wslTarget
      ? execCommandInWslOrThrow(wslTarget, `${shellQuote(command)} ${versionArgs.join(' ')}`)
      : execLocalPreflightCommandOrThrow(command, versionArgs))
    return true
  } catch {
    return false
  }
}

export async function isCommandOnPath(
  command: string,
  wslTarget?: WslPreflightTarget
): Promise<boolean> {
  if (!wslTarget) {
    // Why (#9297): resolve against PATH with fs instead of spawning one
    // where/which subprocess per probe — privilege-management software gates
    // each spawn and stalls startup. buildLocalPreflightEnv() supplies the same
    // registry-merged PATH the child process previously saw (undefined = posix
    // process.env), so the found/not-found result is identical.
    return isCommandOnLocalPath(command, { env: buildLocalPreflightEnv() })
  }
  try {
    // Why: preflight must validate the executable on PATH, not a shell alias or function.
    const { stdout } = await execCommandInWslOrThrow(
      wslTarget,
      [
        // Same skip as agent detection: without it this branch answers "yes"
        // for a Windows binary reached through interop, so preflight and the
        // detector disagree about the same distro.
        buildPosixCommandPathLookupScript(
          { kind: 'literal', value: command },
          { skipWindowsMountDirs: true }
        ),
        'if [ -n "$resolved" ]; then',
        `printf '${WSL_COMMAND_PATH_SENTINEL}%s\\n' "$resolved"`,
        'fi'
      ].join('\n')
    )
    // Why: WSL startup chatter can contain unrelated absolute paths.
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith(WSL_COMMAND_PATH_SENTINEL))
      .map((line) => line.slice(WSL_COMMAND_PATH_SENTINEL.length))
      .some((line) => path.posix.isAbsolute(line))
  } catch {
    return false
  }
}
