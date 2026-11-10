import {
  ORCA_CLI_SKILL_INSTALL_COMMAND,
  ORCA_CLI_SKILL_UPDATE_COMMAND
} from '@/lib/agent-feature-install-commands'
import { useActiveProjectSkillRuntime } from '@/hooks/useActiveProjectSkillRuntime'
import {
  AGENT_SKILL_CLI_PREREQUISITE_NOTICE,
  ensureOrcaCliAvailableForAgentSkillTerminal
} from '@/lib/agent-skill-cli-prerequisite'
import {
  buildSkillCommandForRuntime,
  ensureWslCliAvailableForAgentSkillTerminal,
  getWslCliDistroRequest
} from '../../CliSkillRuntimeSetup'
import { AgentSkillSetupPanel } from '../../AgentSkillSetupPanel'
import { StepBadge } from '../../SetupStepBadge'
import { useTranslate } from '@/i18n/use-translate'

type Props = {
  skillDetected: boolean
  skillLoading: boolean
  skillError: string | null
  disabled?: boolean
  onBeforeInstall?: () => void | Promise<void>
  onRecheck: () => void | Promise<unknown>
}

function browserSkillStepBadge(complete: boolean): React.JSX.Element {
  return <StepBadge index={1} state={complete ? 'done' : 'pending'} />
}

export function BrowserUseSkillStep({
  skillDetected,
  skillLoading,
  skillError,
  disabled = false,
  onBeforeInstall,
  onRecheck
}: Props): React.JSX.Element {
  const t = useTranslate()
  const activeSkillRuntime = useActiveProjectSkillRuntime()
  const command = activeSkillRuntime.installDisabledReason
    ? ORCA_CLI_SKILL_INSTALL_COMMAND
    : buildSkillCommandForRuntime(ORCA_CLI_SKILL_INSTALL_COMMAND, activeSkillRuntime.agentRuntime)
  const installedCommand = activeSkillRuntime.installDisabledReason
    ? ORCA_CLI_SKILL_UPDATE_COMMAND
    : buildSkillCommandForRuntime(ORCA_CLI_SKILL_UPDATE_COMMAND, activeSkillRuntime.agentRuntime)
  return (
    <AgentSkillSetupPanel
      variant="inline"
      title={t('auto.components.settings.BrowserUseSkillStep.459e24eebc', 'Browser Use skill')}
      description={t(
        'auto.components.settings.BrowserUseSkillStep.0871b6998d',
        "Enables agents to navigate and verify pages in Orca's browser."
      )}
      command={command}
      installedCommand={installedCommand}
      terminalTitle="Browser Use setup"
      terminalAriaLabel="Browser Use skill install terminal"
      terminalWorktreeId="settings-browser-use-skill-terminal"
      terminalShellOverride={activeSkillRuntime.terminalShellOverride}
      terminalRuntime={activeSkillRuntime.agentRuntime}
      installed={skillDetected}
      loading={skillLoading}
      error={skillError}
      installDisabled={disabled}
      leading={browserSkillStepBadge(skillDetected)}
      preInstallNotice={AGENT_SKILL_CLI_PREREQUISITE_NOTICE}
      getPrerequisiteStatus={() =>
        activeSkillRuntime.agentRuntime?.runtime === 'wsl'
          ? window.api.cli.getWslInstallStatus(
              getWslCliDistroRequest(activeSkillRuntime.agentRuntime)
            )
          : window.api.cli.getInstallStatus()
      }
      onBeforeOpenTerminal={async () => {
        await onBeforeInstall?.()
        await (activeSkillRuntime.agentRuntime?.runtime === 'wsl'
          ? ensureWslCliAvailableForAgentSkillTerminal(activeSkillRuntime.agentRuntime)
          : ensureOrcaCliAvailableForAgentSkillTerminal())
      }}
      onRecheck={onRecheck}
    />
  )
}
