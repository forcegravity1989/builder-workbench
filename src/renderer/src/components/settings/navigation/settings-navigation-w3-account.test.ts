import { describe, expect, it, vi } from 'vitest'
import { buildSetupSettingsSections } from './settings-navigation-capability-sections'
import type { SettingsNavigationBuildOptions } from './settings-navigation-build-options'

const { isWorkbenchShell } = vi.hoisted(() => ({ isWorkbenchShell: vi.fn(() => true) }))
vi.mock('@/workbench/is-workbench-shell', () => ({ isWorkbenchShell }))

const desktop: SettingsNavigationBuildOptions = {
  isMac: false,
  isWindows: false,
  isLocalWindowsHost: false,
  isWindowsTerminalHost: false,
  isWebClient: false,
  botsEnabled: true,
  hostQueuesMessages: true,
  managedBrowserCreationEnabled: true,
  mobileEmulatorCreationEnabled: false,
  isDev: false,
  isLinearConnected: false,
  repos: [],
  bots: []
}

describe('W3 account settings navigation', () => {
  it('adds a distinct W3 entry and search result only on a Workbench desktop', () => {
    const sections = buildSetupSettingsSections(desktop)
    expect(sections.map((section) => section.id)).not.toContain('orca-account')
    const account = sections.find((section) => section.id === 'w3-account')
    expect(account?.group).toBe('setup')
    expect(account?.searchEntries[0]?.title).toBe('W3 account')
    expect(
      buildSetupSettingsSections({ ...desktop, isWebClient: true }).map((item) => item.id)
    ).not.toContain('w3-account')

    isWorkbenchShell.mockReturnValue(false)
    const orcaIds = buildSetupSettingsSections(desktop).map((item) => item.id)
    expect(orcaIds).toContain('orca-account')
    expect(orcaIds).not.toContain('w3-account')
  })
})
