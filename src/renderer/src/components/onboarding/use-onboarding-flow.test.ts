import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import {
  prepareSkippedOnboardingPreferences,
  remapOpenOnboardingLastCompletedStep,
  shouldSkipIntegrationsStep
} from './onboarding-flow-state'
import { getDefaultOnboardingState } from '../../../../shared/constants'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() }
}))

// Why: the skip rule branches on the shell; a mutable flag lets one file
// cover both the Workbench and Orca branches of shouldSkipIntegrationsStep.
const shellFlag = vi.hoisted(() => ({ workbench: false }))
vi.mock('@/workbench/is-workbench-shell', () => ({
  isWorkbenchShell: () => shellFlag.workbench
}))

describe('prepareSkippedOnboardingPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('surfaces theme restore persistence failures without throwing', async () => {
    const setTheme = vi.fn()
    const applyTheme = vi.fn()
    const updateSettings = vi.fn().mockRejectedValue(new Error('settings IPC failed'))
    const setError = vi.fn()

    await expect(
      prepareSkippedOnboardingPreferences({
        currentStepId: 'theme',
        themeBeforePreview: 'dark',
        settingsTheme: 'light',
        selectedAgent: null,
        setTheme,
        applyTheme,
        updateSettings,
        setError
      })
    ).resolves.toBe(false)

    expect(setTheme).toHaveBeenCalledWith('dark')
    expect(applyTheme).toHaveBeenCalledWith('dark')
    expect(updateSettings).toHaveBeenCalledWith({ theme: 'dark' })
    expect(setError).toHaveBeenCalledWith('settings IPC failed')
    expect(toast.error).toHaveBeenCalledWith('Could not save progress', {
      description: 'settings IPC failed'
    })
  })

  it('keeps the selected agent preference before opening project setup', async () => {
    const setTheme = vi.fn()
    const applyTheme = vi.fn()
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const setError = vi.fn()

    await expect(
      prepareSkippedOnboardingPreferences({
        currentStepId: 'agent',
        themeBeforePreview: null,
        settingsTheme: 'light',
        selectedAgent: 'codex',
        setTheme,
        applyTheme,
        updateSettings,
        setError
      })
    ).resolves.toBe(true)

    expect(setTheme).not.toHaveBeenCalled()
    expect(applyTheme).not.toHaveBeenCalled()
    expect(updateSettings).toHaveBeenCalledWith({ defaultTuiAgent: 'codex' })
    expect(setError).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })
})

describe('remapOpenOnboardingLastCompletedStep', () => {
  it('remaps unversioned seven-step open progress to the current flow', () => {
    const base = { ...getDefaultOnboardingState(), flowVersion: 1 }

    expect(remapOpenOnboardingLastCompletedStep({ ...base, lastCompletedStep: 3 })).toBe(2)
    expect(remapOpenOnboardingLastCompletedStep({ ...base, lastCompletedStep: 4 })).toBe(2)
    expect(remapOpenOnboardingLastCompletedStep({ ...base, lastCompletedStep: 5 })).toBe(3)
    expect(remapOpenOnboardingLastCompletedStep({ ...base, lastCompletedStep: 9 })).toBe(3)
  })

  it('remaps versioned five-step open progress to the current flow', () => {
    const base = { ...getDefaultOnboardingState(), flowVersion: 2 }

    expect(remapOpenOnboardingLastCompletedStep({ ...base, lastCompletedStep: 3 })).toBe(2)
    expect(remapOpenOnboardingLastCompletedStep({ ...base, lastCompletedStep: 4 })).toBe(3)
    expect(remapOpenOnboardingLastCompletedStep({ ...base, lastCompletedStep: 5 })).toBe(3)
    expect(remapOpenOnboardingLastCompletedStep({ ...base, lastCompletedStep: 9 })).toBe(3)
  })

  it('remaps versioned four-step open progress around the inserted Windows step', () => {
    const base = { ...getDefaultOnboardingState(), flowVersion: 3 }

    expect(remapOpenOnboardingLastCompletedStep({ ...base, lastCompletedStep: 3 })).toBe(3)
    expect(remapOpenOnboardingLastCompletedStep({ ...base, lastCompletedStep: 4 })).toBe(4)
    expect(remapOpenOnboardingLastCompletedStep({ ...base, lastCompletedStep: 9 })).toBe(4)
  })

  it('keeps current five-step progress intact', () => {
    expect(
      remapOpenOnboardingLastCompletedStep({
        ...getDefaultOnboardingState(),
        lastCompletedStep: 3
      })
    ).toBe(3)
  })

  it('maps unversioned completed onboarding to the current final step', () => {
    expect(
      remapOpenOnboardingLastCompletedStep({
        ...getDefaultOnboardingState(),
        flowVersion: 1,
        outcome: 'completed',
        lastCompletedStep: 7
      })
    ).toBe(5)
  })
})

describe('shouldSkipIntegrationsStep', () => {
  afterEach(() => {
    shellFlag.workbench = false
  })

  function preflight(
    gh: { installed: boolean; authenticated: boolean },
    codehub?: { installed: boolean; authenticated: boolean }
  ): Parameters<typeof shouldSkipIntegrationsStep>[0] {
    return { git: { installed: true }, gh, codehub }
  }

  it('skips for the Orca shell once gh is installed', () => {
    expect(shouldSkipIntegrationsStep(preflight({ installed: true, authenticated: true }))).toBe(
      true
    )
  })

  it('keeps the page for the Orca shell when gh is missing', () => {
    expect(shouldSkipIntegrationsStep(preflight({ installed: false, authenticated: false }))).toBe(
      false
    )
  })

  it('skips for the Workbench shell only once both CLIs are installed', () => {
    shellFlag.workbench = true
    expect(
      shouldSkipIntegrationsStep(
        preflight(
          { installed: true, authenticated: true },
          { installed: true, authenticated: true }
        )
      )
    ).toBe(true)
  })

  it('keeps the page for the Workbench shell when codehub-cli is missing', () => {
    shellFlag.workbench = true
    expect(
      shouldSkipIntegrationsStep(
        preflight(
          { installed: true, authenticated: true },
          { installed: false, authenticated: false }
        )
      )
    ).toBe(false)
  })

  it('keeps the page when the payload predates the codehub readback', () => {
    shellFlag.workbench = true
    expect(shouldSkipIntegrationsStep(preflight({ installed: true, authenticated: true }))).toBe(
      false
    )
  })
})
