import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CliInstallStatus } from '../../../../shared/cli-install-types'
import {
  buildAgentFeatureSkillInstallCommand,
  ORCA_CLI_SKILL_NAME,
  ORCA_LINEAR_SKILL_NAME,
  ORCHESTRATION_SKILL_NAME
} from '@/lib/agent-feature-install-commands'
import { BROWSER_USE_ENABLED_STORAGE_KEY } from '@/lib/browser-use-setup-state'
import {
  ORCHESTRATION_ENABLED_STORAGE_KEY,
  ORCHESTRATION_SETUP_DISMISSED_STORAGE_KEY
} from '@/lib/orchestration-setup-state'
import {
  DEFAULT_ONBOARDING_FEATURE_SETUP_SELECTION,
  buildOnboardingFeatureSetupClipboardText,
  createOnboardingFeatureSetupDeps,
  onboardingFeatureSetupRunTelemetry,
  onboardingFeatureSetupTelemetryFeature,
  onboardingFeatureSetupTelemetrySelection,
  runOnboardingFeatureSetup,
  type OnboardingFeatureSetupDeps,
  type OnboardingFeatureSetupSelection
} from './onboarding-feature-setup'
import { getOnboardingFeatureSetupAgentRuntime } from './onboarding-feature-setup-runtime'

const ALL_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  ORCA_CLI_SKILL_NAME,
  ORCHESTRATION_SKILL_NAME,
  ORCA_LINEAR_SKILL_NAME
])
const ORCHESTRATION_ONLY_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  ORCHESTRATION_SKILL_NAME
])

const INSTALLED_CLI_STATUS: CliInstallStatus = {
  platform: 'darwin',
  commandName: 'orca',
  commandPath: '/usr/local/bin/orca',
  pathDirectory: '/usr/local/bin',
  pathConfigured: true,
  launcherPath: '/Applications/Orca.app/Contents/MacOS/Orca',
  installMethod: 'symlink',
  supported: true,
  state: 'installed',
  currentTarget: '/Applications/Orca.app/Contents/MacOS/Orca',
  unsupportedReason: null,
  detail: null
}

function createDeps(
  overrides: Partial<OnboardingFeatureSetupDeps> = {}
): OnboardingFeatureSetupDeps & {
  storage: Map<string, string>
  clipboardWrites: string[]
} {
  const storage = new Map<string, string>()
  const clipboardWrites: string[] = []
  return {
    storage,
    clipboardWrites,
    getCliStatus: vi.fn(async () => INSTALLED_CLI_STATUS),
    showCliRegistrationPrompt: vi.fn(async () => undefined),
    installCli: vi.fn(async () => INSTALLED_CLI_STATUS),
    writeClipboardText: vi.fn(async (text: string) => {
      clipboardWrites.push(text)
    }),
    setStorageItem: vi.fn((key: string, value: string) => {
      storage.set(key, value)
    }),
    removeStorageItem: vi.fn((key: string) => {
      storage.delete(key)
    }),
    notifyOrchestrationStateChanged: vi.fn(),
    ...overrides
  }
}

describe('onboarding feature setup runner', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults every setup item on so first-launch setup is ready to run', () => {
    expect(DEFAULT_ONBOARDING_FEATURE_SETUP_SELECTION).toEqual({
      browserUse: true,
      orchestration: true,
      linearTickets: false
    })
  })

  it('builds one skill command for selected onboarding feature setup skills', () => {
    const text = buildOnboardingFeatureSetupClipboardText({
      browserUse: true,
      orchestration: true,
      linearTickets: true
    })

    expect(text).toBe(ALL_SKILL_INSTALL_COMMAND)
    expect(text).toBe(
      'npx skills add https://github.com/stablyai/orca --skill orca-cli --skill orchestration --skill orca-linear --global'
    )
  })

  it('keeps the copied command valid for the WSL target shell', () => {
    const text = buildOnboardingFeatureSetupClipboardText(
      { browserUse: false, orchestration: true, linearTickets: false },
      { runtime: 'wsl', wslDistro: 'Ubuntu', label: 'WSL Ubuntu' }
    )

    expect(text).toBe(ORCHESTRATION_ONLY_SKILL_INSTALL_COMMAND)
  })

  it('leaves the copied command bare for a host runtime', () => {
    const text = buildOnboardingFeatureSetupClipboardText(
      { browserUse: false, orchestration: true, linearTickets: false },
      { runtime: 'host', label: 'Windows' }
    )

    expect(text).toBe(ORCHESTRATION_ONLY_SKILL_INSTALL_COMMAND)
  })

  it('falls back to the host when the selected runtime needs repair', () => {
    expect(
      getOnboardingFeatureSetupAgentRuntime({
        agentRuntime: { runtime: 'wsl', wslDistro: 'Missing', label: 'WSL Missing' },
        installDisabledReason: 'The selected WSL distro is unavailable.'
      })
    ).toBeUndefined()
  })

  it('uses the WSL CLI APIs for the selected distro', async () => {
    const getInstallStatus = vi.fn()
    const install = vi.fn()
    const getWslInstallStatus = vi.fn(async () => INSTALLED_CLI_STATUS)
    const installWsl = vi.fn(async () => INSTALLED_CLI_STATUS)
    vi.stubGlobal('window', {
      api: { cli: { getInstallStatus, install, getWslInstallStatus, installWsl } }
    })
    const deps = createOnboardingFeatureSetupDeps({
      runtime: 'wsl',
      wslDistro: 'Ubuntu',
      label: 'WSL Ubuntu'
    })

    await deps.getCliStatus()
    await deps.installCli()

    expect(getWslInstallStatus).toHaveBeenCalledWith({ distro: 'Ubuntu' })
    expect(installWsl).toHaveBeenCalledWith({ distro: 'Ubuntu' })
    expect(getInstallStatus).not.toHaveBeenCalled()
    expect(install).not.toHaveBeenCalled()
  })

  it('keeps the runner on the host when the selected WSL runtime needs repair', async () => {
    const deps = createDeps()

    await runOnboardingFeatureSetup(
      { browserUse: false, orchestration: true, linearTickets: false },
      deps,
      {
        agentRuntime: { runtime: 'wsl', wslDistro: 'Missing', label: 'WSL Missing' },
        installDisabledReason: 'The selected WSL distro is unavailable.'
      }
    )

    expect(deps.clipboardWrites).toEqual([ORCHESTRATION_ONLY_SKILL_INSTALL_COMMAND])
  })

  it('builds privacy-safe telemetry payloads for selected feature setup items', () => {
    const selection: OnboardingFeatureSetupSelection = {
      browserUse: true,
      orchestration: true,
      linearTickets: true
    }

    expect(onboardingFeatureSetupTelemetryFeature('browserUse')).toBe('browser_use')
    expect(onboardingFeatureSetupTelemetrySelection(selection)).toEqual({
      browser_use: true,
      linear_tickets: true,
      orchestration: true,
      selected_count: 2
    })
    expect(
      onboardingFeatureSetupRunTelemetry(selection, {
        selectedIds: ['browserUse', 'orchestration', 'linearTickets'],
        cliTouched: true,
        skillCommandsCopied: false,
        skillInstallCommand: ORCHESTRATION_ONLY_SKILL_INSTALL_COMMAND,
        warnings: [{ featureId: 'skills', message: 'Clipboard unavailable' }]
      })
    ).toEqual({
      browser_use: true,
      linear_tickets: true,
      orchestration: true,
      selected_count: 2,
      cli_touched: true,
      skill_commands_copied: false,
      skill_install_command_prepared: true,
      warning_count: 1
    })
  })

  it('runs selected feature setup through injected deps only', async () => {
    const deps = createDeps()

    const result = await runOnboardingFeatureSetup(
      { browserUse: true, orchestration: true, linearTickets: true },
      deps
    )

    expect(result).toEqual({
      selectedIds: ['browserUse', 'orchestration', 'linearTickets'],
      cliTouched: false,
      skillCommandsCopied: true,
      skillInstallCommand: ALL_SKILL_INSTALL_COMMAND,
      warnings: []
    })
    expect(deps.getCliStatus).toHaveBeenCalledTimes(1)
    expect(deps.showCliRegistrationPrompt).not.toHaveBeenCalled()
    expect(deps.installCli).not.toHaveBeenCalled()
    expect(deps.storage.get(BROWSER_USE_ENABLED_STORAGE_KEY)).toBe('1')
    expect(deps.storage.get(ORCHESTRATION_ENABLED_STORAGE_KEY)).toBe('1')
    expect(deps.removeStorageItem).toHaveBeenCalledWith(ORCHESTRATION_SETUP_DISMISSED_STORAGE_KEY)
    expect(deps.notifyOrchestrationStateChanged).toHaveBeenCalledTimes(1)
    expect(deps.clipboardWrites).toEqual([ALL_SKILL_INSTALL_COMMAND])
  })

  it('keeps invasive Browser Use setup untouched when only Orchestration is selected', async () => {
    const deps = createDeps()
    const selection: OnboardingFeatureSetupSelection = {
      browserUse: false,
      orchestration: true,
      linearTickets: false
    }

    const result = await runOnboardingFeatureSetup(selection, deps)

    expect(result.selectedIds).toEqual(['orchestration'])
    expect(result.skillCommandsCopied).toBe(true)
    expect(result.skillInstallCommand).toBe(ORCHESTRATION_ONLY_SKILL_INSTALL_COMMAND)
    expect(deps.getCliStatus).toHaveBeenCalledTimes(1)
    expect(deps.showCliRegistrationPrompt).not.toHaveBeenCalled()
    expect(deps.installCli).not.toHaveBeenCalled()
    expect(deps.storage.get(BROWSER_USE_ENABLED_STORAGE_KEY)).toBe('0')
    expect(deps.storage.get(ORCHESTRATION_ENABLED_STORAGE_KEY)).toBe('1')
    expect(deps.clipboardWrites).toEqual([ORCHESTRATION_ONLY_SKILL_INSTALL_COMMAND])
  })

  it('clears feature markers when no setup items are selected', async () => {
    const deps = createDeps()

    const result = await runOnboardingFeatureSetup(
      { browserUse: false, orchestration: false, linearTickets: false },
      deps
    )

    expect(result).toEqual({
      selectedIds: [],
      cliTouched: false,
      skillCommandsCopied: false,
      skillInstallCommand: null,
      warnings: []
    })
    expect(deps.storage.get(BROWSER_USE_ENABLED_STORAGE_KEY)).toBe('0')
    expect(deps.storage.get(ORCHESTRATION_ENABLED_STORAGE_KEY)).toBe('0')
    expect(deps.getCliStatus).not.toHaveBeenCalled()
    expect(deps.showCliRegistrationPrompt).not.toHaveBeenCalled()
    expect(deps.clipboardWrites).toEqual([])
  })

  it('warns when selected skill commands cannot be copied', async () => {
    const deps = createDeps({
      writeClipboardText: vi.fn(async () => {
        throw new Error('Clipboard unavailable')
      })
    })

    const result = await runOnboardingFeatureSetup(
      { browserUse: false, orchestration: true, linearTickets: false },
      deps
    )

    expect(result.skillCommandsCopied).toBe(false)
    expect(result.skillInstallCommand).toBe(ORCHESTRATION_ONLY_SKILL_INSTALL_COMMAND)
    expect(result.warnings).toEqual([
      {
        featureId: 'skills',
        message: 'Clipboard unavailable'
      }
    ])
    expect(deps.clipboardWrites).toEqual([])
  })

  it('shows CLI registration context before installing a missing CLI during onboarding', async () => {
    const staleStatus: CliInstallStatus = {
      ...INSTALLED_CLI_STATUS,
      state: 'stale',
      currentTarget: '/tmp/other-orca',
      detail: '/usr/local/bin/orca points to a different launcher.'
    }
    const showCliRegistrationPrompt = vi.fn(async () => undefined)
    const installCli = vi.fn(async () => INSTALLED_CLI_STATUS)
    const deps = createDeps({
      getCliStatus: vi.fn(async () => staleStatus),
      showCliRegistrationPrompt,
      installCli
    })

    const result = await runOnboardingFeatureSetup(
      { browserUse: true, orchestration: false, linearTickets: false },
      deps
    )

    expect(result.cliTouched).toBe(true)
    expect(showCliRegistrationPrompt).toHaveBeenCalledTimes(1)
    expect(installCli).toHaveBeenCalledTimes(1)
    expect(showCliRegistrationPrompt.mock.invocationCallOrder[0]).toBeLessThan(
      installCli.mock.invocationCallOrder[0]
    )
  })

  it('warns without changing PATH when the Windows registry read is unknown', async () => {
    const unknownStatus: CliInstallStatus = {
      ...INSTALLED_CLI_STATUS,
      platform: 'win32',
      pathConfigured: null,
      detail: 'Orca could not read the Windows user PATH registry value.'
    }
    const deps = createDeps({ getCliStatus: vi.fn(async () => unknownStatus) })

    const result = await runOnboardingFeatureSetup(
      { browserUse: true, orchestration: false, linearTickets: false },
      deps
    )

    expect(result.cliTouched).toBe(false)
    expect(result.warnings).toContainEqual({ featureId: 'cli', message: unknownStatus.detail })
    expect(deps.showCliRegistrationPrompt).not.toHaveBeenCalled()
    expect(deps.installCli).not.toHaveBeenCalled()
  })
})
