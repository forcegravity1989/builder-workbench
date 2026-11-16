import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: {
    getPath: () => {
      throw new Error('tests pass explicit homes')
    }
  }
}))

import {
  applyCodexDaemonSocketGuard,
  codexDaemonSocketPath,
  codexDaemonSocketPathExceedsLimit,
  stripCodexDaemonOverride
} from './codex-daemon-socket-path-guard'
import {
  syncSystemConfigIntoLegacySharedCodexHome,
  syncSystemConfigIntoManagedCodexHome
} from './codex-config-mirror'
import { getCodexConfigSyncStatus } from './config-sync-stall'
import { getCodexSettingsBaselinePath } from './config-settings-baseline'
import { extractOrdinaryCodexSettings } from './config-toml-runtime-owned-sections'

const UUID = '9dd962e2-449d-44c4-9733-0633f255064a'
const MAC_MANAGED_HOME = `/Users/john/Library/Application Support/orca/codex-accounts/${UUID}/home`
const OVERRIDE_LINE = 'daemon_auto_start = false # orca: CODEX_HOME too long for the daemon socket'

// The socket suffix is 43 bytes: sun_path 104 (macOS) / 108 (Linux) leaves 60 / 64 for the home.
function homeOfLength(length: number): string {
  return `/${'a'.repeat(length - 1)}`
}

describe('codexDaemonSocketPathExceedsLimit', () => {
  it('uses the platform socket limit and measures UTF-8 bytes', () => {
    expect(codexDaemonSocketPathExceedsLimit(homeOfLength(60), 'darwin')).toBe(false)
    expect(codexDaemonSocketPathExceedsLimit(homeOfLength(61), 'darwin')).toBe(true)
    expect(codexDaemonSocketPathExceedsLimit(homeOfLength(64), 'linux')).toBe(false)
    expect(codexDaemonSocketPathExceedsLimit(homeOfLength(65), 'linux')).toBe(true)
    const home = `/${'é'.repeat(30)}`
    expect(home.length).toBe(31)
    expect(codexDaemonSocketPathExceedsLimit(home, 'darwin')).toBe(true)
    const windowsHome = `C:\\Users\\neil\\AppData\\Roaming\\orca\\codex-accounts\\${UUID}\\home`
    expect(codexDaemonSocketPathExceedsLimit(windowsHome, 'win32')).toBe(true)
    expect(codexDaemonSocketPathExceedsLimit('C:\\Users\\neil\\.codex', 'win32')).toBe(false)
  })

  it('measures WSL homes by their Linux path and limit', () => {
    const shortWsl = '\\\\wsl.localhost\\Ubuntu\\home\\u\\.codex-orca'
    expect(codexDaemonSocketPath(shortWsl, 'win32')).toBe(
      '/home/u/.codex-orca/app-server-control/app-server-control.sock'
    )
    expect(codexDaemonSocketPathExceedsLimit(shortWsl, 'win32')).toBe(false)
    const managedWsl = `\\\\wsl.localhost\\Ubuntu\\home\\u\\.local\\share\\orca\\codex-accounts\\${UUID}\\home`
    expect(codexDaemonSocketPathExceedsLimit(managedWsl, 'win32')).toBe(true)
  })
})

describe('applyCodexDaemonSocketGuard', () => {
  it('upserts the daemon setting using the existing TOML table or dotted keys', () => {
    const config = '[features]\nhooks = true\ndaemon_auto_start = true\n\n[tui]\ntheme = "dark"\n'
    const guarded = applyCodexDaemonSocketGuard(config, MAC_MANAGED_HOME, 'darwin')
    expect(guarded).toBe(`[features]\nhooks = true\n${OVERRIDE_LINE}\n\n[tui]\ntheme = "dark"\n`)
    expect(stripCodexDaemonOverride(guarded)).toBe(
      '[features]\nhooks = true\n\n[tui]\ntheme = "dark"\n'
    )
    const dottedConfig = 'features.hooks = true\n\n[tui]\ntheme = "dark"\n'
    expect(applyCodexDaemonSocketGuard(dottedConfig, MAC_MANAGED_HOME, 'darwin')).toBe(
      `features.hooks = true\nfeatures.${OVERRIDE_LINE}\n\n[tui]\ntheme = "dark"\n`
    )
  })

  it('preserves CRLF and strips the runtime setting before promoting or moving homes', () => {
    const crlf = 'model = "gpt-5"\r\n'
    const guarded = applyCodexDaemonSocketGuard(crlf, MAC_MANAGED_HOME, 'darwin')
    expect(guarded).toBe(`model = "gpt-5"\r\n\r\n[features]\r\n${OVERRIDE_LINE}\r\n`)
    expect(extractOrdinaryCodexSettings(guarded)).toBe('model = "gpt-5"')
    expect(applyCodexDaemonSocketGuard(guarded, 'C:\\short\\home', 'win32')).toBe(crlf)
  })
})

describe('syncSystemConfigIntoManagedCodexHome daemon guard', () => {
  let root: string
  let systemHomePath: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cx-'))
    systemHomePath = join(root, 's')
    mkdirSync(systemHomePath)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  function makeHome(name: string): string {
    const home = join(root, name)
    mkdirSync(home, { recursive: true })
    return home
  }

  const longHome = (): string =>
    makeHome(join('Library', 'Application Support', 'orca', 'codex-accounts', UUID, 'home'))

  it('turns daemon auto-start off in a long managed home without touching ~/.codex', () => {
    const systemConfig = 'model = "gpt-5"\n'
    writeFileSync(join(systemHomePath, 'config.toml'), systemConfig)
    const runtimeHomePath = longHome()

    syncSystemConfigIntoManagedCodexHome({ runtimeHomePath, systemHomePath })
    const first = readFileSync(join(runtimeHomePath, 'config.toml'), 'utf-8')
    expect(first).toBe(`model = "gpt-5"\n\n[features]\n${OVERRIDE_LINE}\n`)

    syncSystemConfigIntoManagedCodexHome({ runtimeHomePath, systemHomePath })
    expect(readFileSync(join(runtimeHomePath, 'config.toml'), 'utf-8')).toBe(first)
    expect(readFileSync(join(systemHomePath, 'config.toml'), 'utf-8')).toBe(systemConfig)
  })

  it('still guards a long home when the user has no ~/.codex/config.toml', () => {
    const runtimeHomePath = longHome()
    syncSystemConfigIntoManagedCodexHome({ runtimeHomePath, systemHomePath })
    expect(readFileSync(join(runtimeHomePath, 'config.toml'), 'utf-8')).toBe(
      `[features]\n${OVERRIDE_LINE}\n`
    )
    // A guard-only runtime config withholds no settings, so it must not raise the missing-source warning.
    expect(getCodexConfigSyncStatus({ runtimeHomePath, systemHomePath }).state).toBe('synced')
  })

  it('still guards an existing home when a stalled settings write-back skips the mirror', () => {
    writeFileSync(join(systemHomePath, 'config.toml'), 'model = "gpt-5"\n')
    const runtimeHomePath = longHome()
    writeFileSync(join(runtimeHomePath, 'config.toml'), 'model = "runtime"\n')
    // An unreadable baseline makes promotion refuse, so no mirror pass runs.
    mkdirSync(getCodexSettingsBaselinePath(runtimeHomePath))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    syncSystemConfigIntoManagedCodexHome({ runtimeHomePath, systemHomePath })
    warn.mockRestore()
    expect(readFileSync(join(runtimeHomePath, 'config.toml'), 'utf-8')).toBe(
      `model = "runtime"\n\n[features]\n${OVERRIDE_LINE}\n`
    )
    expect(readFileSync(join(systemHomePath, 'config.toml'), 'utf-8')).toBe('model = "gpt-5"\n')
  })

  it('keeps the guard in the legacy shared home when a system launch refreshes it', () => {
    writeFileSync(join(systemHomePath, 'config.toml'), 'model = "gpt-5"\n')
    const runtimeHomePath = longHome()
    writeFileSync(
      join(runtimeHomePath, 'config.toml'),
      `model = "old"\n\n[features]\n${OVERRIDE_LINE}\n`
    )
    syncSystemConfigIntoLegacySharedCodexHome({ runtimeHomePath, systemHomePath })
    expect(readFileSync(join(runtimeHomePath, 'config.toml'), 'utf-8')).toContain(OVERRIDE_LINE)
    expect(readFileSync(join(runtimeHomePath, 'config.toml'), 'utf-8')).toContain('model = "gpt-5"')
    expect(readFileSync(join(systemHomePath, 'config.toml'), 'utf-8')).toBe('model = "gpt-5"\n')
  })
})
