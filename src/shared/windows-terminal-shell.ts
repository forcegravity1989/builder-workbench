import type { AgentStartupShell } from './tui-agent-startup-shell'

export const WINDOWS_GIT_BASH_SHELL = 'git-bash'

export type BuiltInWindowsTerminalShell =
  | 'powershell.exe'
  | 'cmd.exe'
  | 'wsl.exe'
  | typeof WINDOWS_GIT_BASH_SHELL

/**
 * Classifies a configured `terminalWindowsShell` value into the startup-shell
 * family used to quote queued commands. Git Bash / wsl.exe run a POSIX shell;
 * cmd.exe needs cmd quoting; everything else (PowerShell, pwsh, unknown) is
 * treated as PowerShell, matching the Windows default.
 */
export function resolveWindowsShellStartupFamily(
  shell: string | null | undefined
): AgentStartupShell {
  const trimmed = shell?.trim()
  if (!trimmed) {
    return 'powershell'
  }
  if (trimmed === WINDOWS_GIT_BASH_SHELL) {
    return 'posix'
  }
  const basename = trimmed.replaceAll('\\', '/').split('/').pop()?.toLowerCase() ?? ''
  if (basename === 'cmd.exe') {
    return 'cmd'
  }
  // Why: wsl.exe and bash.exe (Git for Windows) launch POSIX shells, so queued
  // commands must use POSIX quoting and `cd '<cwd>'` rather than cmd/PowerShell.
  // Extension-less forms reach the same executables through PATHEXT.
  if (
    basename === 'wsl.exe' ||
    basename === 'wsl' ||
    basename === 'bash.exe' ||
    basename === 'bash'
  ) {
    return 'posix'
  }
  return 'powershell'
}

export function resolveLocalWindowsAgentStartupShell(args: {
  platform: NodeJS.Platform
  isRemote: boolean
  terminalWindowsShell?: string | null
}): AgentStartupShell | undefined {
  // Why: terminalWindowsShell describes the local host shell; SSH/remote
  // targets need their own shell signal before we can safely override quoting.
  if (args.platform !== 'win32' || args.isRemote) {
    return undefined
  }
  return resolveWindowsShellStartupFamily(args.terminalWindowsShell)
}

/** The shell a command typed into a new pane runs in on its host: the tab's override, then that
 *  host's own Windows shell setting, then the platform default (undefined for a remote host). */
export function resolveHostAgentStartupShell(args: {
  platform: NodeJS.Platform | null | undefined
  isRemote: boolean
  tabShellOverride?: string | null
  /** The executing host's setting: this client's for a local host, the reported one for a remote host. */
  hostTerminalWindowsShell?: string | null
}): AgentStartupShell | undefined {
  if (args.platform !== 'win32') {
    return undefined
  }
  const shell = args.tabShellOverride?.trim() || args.hostTerminalWindowsShell?.trim()
  if (!shell) {
    return args.isRemote ? undefined : resolveWindowsShellStartupFamily(undefined)
  }
  return resolveWindowsShellStartupFamily(canonicalizeWindowsShellOverride(shell) ?? shell)
}

const WINDOWS_SHELL_OVERRIDE_CANONICAL_NAMES: ReadonlyMap<string, string> = new Map([
  ['powershell.exe', 'powershell.exe'],
  ['powershell', 'powershell.exe'],
  ['pwsh.exe', 'pwsh.exe'],
  ['pwsh', 'pwsh.exe'],
  ['cmd.exe', 'cmd.exe'],
  ['cmd', 'cmd.exe'],
  ['wsl.exe', 'wsl.exe'],
  ['wsl', 'wsl.exe'],
  // Both bash spellings already work with local/daemon PTYs; keep relay acceptance aligned.
  ['bash.exe', 'bash.exe'],
  ['bash', 'bash.exe'],
  [WINDOWS_GIT_BASH_SHELL, WINDOWS_GIT_BASH_SHELL]
])

/** Canonical spelling for an accepted override (case-insensitive), or undefined when refused. */
export function canonicalizeWindowsShellOverride(shell: string): string | undefined {
  return WINDOWS_SHELL_OVERRIDE_CANONICAL_NAMES.get(shell.toLowerCase())
}
