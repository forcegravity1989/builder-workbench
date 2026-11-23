import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Windows user-level vars the dev instance must not silently lose.
 *
 * Why: every PTY inherits the dev process env, and launching from IDE/agent
 * processes with a sanitized environment drops user-level vars. Extend the list
 * when a tool run inside a dev instance needs another such var.
 */
export const WINDOWS_USER_ENV_FOR_DEV = ['NODE_EXTRA_CA_CERTS']

function readWindowsUserEnv(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    return null
  }
  try {
    const value = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        // Why: reg.exe output follows the console code page and would mangle
        // non-ASCII paths; PowerShell lets us pin UTF-8 for this one query.
        `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; [Environment]::GetEnvironmentVariable('${name}','User')`
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }
    ).trim()
    return value || null
  } catch {
    return null
  }
}

function expandWindowsEnvRefs(value, env) {
  return value.replace(/%([^%]+)%/g, (match, name) => env[name] ?? match)
}

/**
 * Restores allowlisted Windows user-level env vars that the launching shell did
 * not inherit. Mutates `env` and returns the restored names so the caller can
 * say why a terminal behaves differently from a fresh PowerShell.
 */
export function inheritWindowsUserEnv(
  env = process.env,
  read = readWindowsUserEnv,
  platform = process.platform
) {
  if (platform !== 'win32') {
    return []
  }
  const restored = []
  for (const name of WINDOWS_USER_ENV_FOR_DEV) {
    if (env[name]?.trim()) {
      continue
    }
    const raw = read(name)
    if (!raw) {
      continue
    }
    const value = expandWindowsEnvRefs(raw, env)
    // Why: a stale cert path would make every TLS connection in the dev
    // instance fail, so only restore a CA bundle that is actually readable.
    if (name === 'NODE_EXTRA_CA_CERTS' && !existsSync(value)) {
      console.warn(`[orca-dev] Skipped ${name}: ${value} does not exist`)
      continue
    }
    env[name] = value
    restored.push(name)
  }
  return restored
}

/** Workbench HMR / trial package env — keeps profile + Dock title off Orca Dev. */
export function isWorkbenchDevEnv(env = process.env) {
  return (
    env.ORCA_PRODUCT_NAME === 'Workbench' ||
    env.WORKBENCH_SHELL === '1' ||
    env.VITE_WORKBENCH_SHELL === '1'
  )
}

export function createDevDockTitle(branch, label, env = process.env) {
  const product = isWorkbenchDevEnv(env) ? 'Workbench' : 'Orca'
  return `${product}: ${branch || label || 'dev'}`
}

export function getDevUserDataPath(env = process.env) {
  if (env.ORCA_DEV_USER_DATA_PATH) {
    return env.ORCA_DEV_USER_DATA_PATH
  }
  const dirName = isWorkbenchDevEnv(env) ? 'workbench-dev' : 'orca-dev'
  if (process.platform === 'darwin') {
    return path.join(env.HOME ?? '', 'Library', 'Application Support', dirName)
  }
  if (process.platform === 'win32') {
    return path.join(env.APPDATA ?? path.join(env.USERPROFILE ?? '', 'AppData', 'Roaming'), dirName)
  }
  return path.join(env.XDG_CONFIG_HOME ?? path.join(env.HOME ?? '', '.config'), dirName)
}
