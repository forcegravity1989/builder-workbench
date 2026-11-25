import { vi } from 'vitest'
import type { CommonProps } from '../../shared/telemetry/telemetry-event-classification'
import type { GlobalSettings } from '../../shared/settings/global-settings-types'
import type { Store } from '../persistence/loading-store/store'

export const BASE_COMMON: CommonProps = {
  app_version: '1.3.33',
  platform: 'darwin',
  arch: 'arm64',
  os_release: '25.3.0',
  install_id: '00000000-0000-4000-8000-000000000000',
  session_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  orca_channel: 'stable'
}

export function makeFakeSettings(telemetry: GlobalSettings['telemetry']): GlobalSettings {
  return { telemetry } as unknown as GlobalSettings
}

export function makeFakeStore(settings: GlobalSettings): Store {
  return {
    getSettings: vi.fn(() => settings),
    updateSettings: vi.fn((updates: Partial<GlobalSettings>) => {
      if (updates.telemetry) {
        settings.telemetry = {
          ...settings.telemetry,
          ...updates.telemetry
        } as typeof settings.telemetry
      }
      return settings
    })
  } as unknown as Store
}

const CONSENT_ENV_VARS = [
  'DO_NOT_TRACK',
  'ORCA_TELEMETRY_DISABLED',
  'CI',
  'GITHUB_ACTIONS',
  'GITLAB_CI',
  'CIRCLECI',
  'TRAVIS',
  'BUILDKITE',
  'JENKINS_URL',
  'TEAMCITY_VERSION'
] as const

export function stashAndClearConsentEnv(): Record<string, string | undefined> {
  const stash: Record<string, string | undefined> = {}
  for (const name of CONSENT_ENV_VARS) {
    stash[name] = process.env[name]
    delete process.env[name]
  }
  return stash
}

export function restoreConsentEnv(stash: Record<string, string | undefined>): void {
  for (const name of CONSENT_ENV_VARS) {
    const prior = stash[name]
    if (prior === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = prior
    }
  }
}
