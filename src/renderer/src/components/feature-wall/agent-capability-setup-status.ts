import { useMemo } from 'react'
import type {
  OnboardingFeatureSetupId,
  OnboardingFeatureSetupSelection
} from '../onboarding/onboarding-feature-setup'
import { ORCA_CLI_SKILL_NAME, ORCHESTRATION_SKILL_NAME } from '@/lib/agent-feature-install-commands'
import {
  GLOBAL_AGENT_SKILL_SOURCE_KINDS,
  useInstalledAgentSkill
} from '@/hooks/useInstalledAgentSkills'
import { useActiveProjectSkillRuntime } from '@/hooks/useActiveProjectSkillRuntime'
import { translate } from '@/i18n/i18n'

export type AgentCapabilityInstallStatusTone = 'ready' | 'pending' | 'checking' | 'error'

export type AgentCapabilityInstallStatus = {
  label: string
  tone: AgentCapabilityInstallStatusTone
  installed?: boolean
}

export type AgentCapabilityReadiness = {
  browserUseSkillInstalled: boolean
  browserUseSkillLoading: boolean
  orchestrationSkillInstalled: boolean
  orchestrationSkillLoading: boolean
}

export type AgentCapabilitySetupStatus = {
  readiness: AgentCapabilityReadiness
  installStatus: Record<OnboardingFeatureSetupId, AgentCapabilityInstallStatus>
}

export function useAgentCapabilitySetupStatus(): AgentCapabilitySetupStatus {
  const activeSkillRuntime = useActiveProjectSkillRuntime()
  const browserUseSkill = useInstalledAgentSkill(ORCA_CLI_SKILL_NAME, {
    discoveryTarget: activeSkillRuntime.discoveryTarget,
    sourceKinds: GLOBAL_AGENT_SKILL_SOURCE_KINDS
  })
  const orchestrationSkill = useInstalledAgentSkill(ORCHESTRATION_SKILL_NAME, {
    discoveryTarget: activeSkillRuntime.discoveryTarget,
    sourceKinds: GLOBAL_AGENT_SKILL_SOURCE_KINDS
  })
  const readiness: AgentCapabilityReadiness = useMemo(
    () => ({
      browserUseSkillInstalled: browserUseSkill.installed,
      browserUseSkillLoading: browserUseSkill.loading,
      orchestrationSkillInstalled: orchestrationSkill.installed,
      orchestrationSkillLoading: orchestrationSkill.loading
    }),
    [
      browserUseSkill.installed,
      browserUseSkill.loading,
      orchestrationSkill.installed,
      orchestrationSkill.loading
    ]
  )

  const installStatus = useMemo(
    () => ({
      browserUse: getSkillInstallStatus(browserUseSkill),
      orchestration: getSkillInstallStatus(orchestrationSkill),
      // Why: linearTickets remains in the onboarding selection shape, but the
      // generic feature wall must not become a Linear skill install surface.
      linearTickets: getFeatureWallExcludedLinearTicketsStatus()
    }),
    [browserUseSkill, orchestrationSkill]
  )

  return { readiness, installStatus }
}

export function getDefaultAgentCapabilitySetupSelection(
  readiness: AgentCapabilityReadiness
): OnboardingFeatureSetupSelection {
  return {
    browserUse: !readiness.browserUseSkillInstalled,
    orchestration: !readiness.orchestrationSkillInstalled,
    linearTickets: false
  }
}

export function isAgentCapabilityReadinessChecking(readiness: AgentCapabilityReadiness): boolean {
  return readiness.browserUseSkillLoading || readiness.orchestrationSkillLoading
}

export function getAgentCapabilityStatusClassName(tone: AgentCapabilityInstallStatusTone): string {
  switch (tone) {
    case 'ready':
      return 'text-green-600 dark:text-green-300'
    case 'error':
      return 'text-destructive'
    case 'checking':
    case 'pending':
      return 'text-muted-foreground'
  }
}

function getSkillInstallStatus(skill: {
  installed: boolean
  loading: boolean
  error: string | null
}): AgentCapabilityInstallStatus {
  if (skill.loading) {
    return {
      label: translate(
        'auto.components.feature.wall.agent.capability.setup.status.9b33e7fb13',
        'Checking install'
      ),
      tone: 'checking'
    }
  }
  if (skill.error) {
    return {
      label: translate(
        'auto.components.feature.wall.agent.capability.setup.status.aa8e143a2f',
        'Could not check install'
      ),
      tone: 'error'
    }
  }
  if (skill.installed) {
    return {
      label: translate(
        'auto.components.feature.wall.agent.capability.setup.status.8eccfcb314',
        'Installed'
      ),
      tone: 'ready',
      installed: true
    }
  }
  return {
    label: translate(
      'auto.components.feature.wall.agent.capability.setup.status.aae94eeb52',
      'Click Install CLI & Skills'
    ),
    tone: 'pending'
  }
}

function getFeatureWallExcludedLinearTicketsStatus(): AgentCapabilityInstallStatus {
  return {
    label: '',
    tone: 'pending'
  }
}
