import { getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { Repo } from '../../../../shared/repo-types'

export type SetupScriptProbeState = {
  signature: string | null
  ready: boolean
  hasSetupScript: boolean
}

export type SetupGuideProgressReadinessInput = {
  refreshEnabled: boolean
  settingsLoaded: boolean
  preflightStatusChecked: boolean
  linearStatusChecked: boolean
  jiraStatusChecked: boolean
  browserUseSkillDiscoveryLoading: boolean
  orchestrationSkillDiscoveryLoading: boolean
  setupScriptProbeReady: boolean
}

export const INITIAL_SETUP_SCRIPT_PROBE_STATE: SetupScriptProbeState = {
  signature: null,
  ready: false,
  hasSetupScript: false
}

export function getSetupScriptProbeSignature(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  orderedGitRepos: readonly Pick<Repo, 'id' | 'hookSettings'>[]
): string | null {
  if (!settings) {
    return null
  }
  const target = getActiveRuntimeTarget(settings)
  return JSON.stringify({
    runtime: target.kind === 'environment' ? target.environmentId : 'local',
    repos: orderedGitRepos.map((repo) => ({
      id: repo.id,
      commandSourcePolicy: repo.hookSettings?.commandSourcePolicy ?? null,
      setup: repo.hookSettings?.scripts?.setup ?? null
    }))
  })
}

export function markSetupScriptProbePending(
  current: SetupScriptProbeState,
  signature: string | null
): SetupScriptProbeState {
  if (current.signature === signature) {
    return current
  }
  return { signature, ready: false, hasSetupScript: false }
}

export function settleSetupScriptProbe(
  current: SetupScriptProbeState,
  signature: string,
  hasSetupScript: boolean
): SetupScriptProbeState {
  if (current.signature !== signature) {
    return current
  }
  return { signature, ready: true, hasSetupScript }
}

export function getCurrentSetupScriptProbeState(
  current: SetupScriptProbeState,
  signature: string | null
): SetupScriptProbeState {
  if (current.signature === signature) {
    return current
  }
  return { signature, ready: false, hasSetupScript: false }
}

export function getSetupGuideProgressReady(input: SetupGuideProgressReadinessInput): boolean {
  return (
    input.refreshEnabled &&
    input.settingsLoaded &&
    input.preflightStatusChecked &&
    input.linearStatusChecked &&
    input.jiraStatusChecked &&
    !input.browserUseSkillDiscoveryLoading &&
    !input.orchestrationSkillDiscoveryLoading &&
    input.setupScriptProbeReady
  )
}
