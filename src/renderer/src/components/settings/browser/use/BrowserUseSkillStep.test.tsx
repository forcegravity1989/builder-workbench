import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  ORCA_CLI_SKILL_INSTALL_COMMAND,
  ORCA_CLI_SKILL_UPDATE_COMMAND
} from '@/lib/agent-feature-install-commands'
import { BrowserUseSkillStep } from './BrowserUseSkillStep'

const capturedPanel = vi.hoisted(() => ({
  props: null as null | Record<string, unknown>
}))

vi.mock('../../AgentSkillSetupPanel', () => ({
  AgentSkillSetupPanel: (props: Record<string, unknown>) => {
    capturedPanel.props = props
    return <div data-testid="browser-use-skill-step" />
  }
}))

vi.mock('@/hooks/useActiveProjectSkillRuntime', () => ({
  useActiveProjectSkillRuntime: () => ({
    installDisabledReason: null,
    agentRuntime: { runtime: 'wsl', label: 'WSL' },
    terminalShellOverride: undefined
  })
}))

describe('BrowserUseSkillStep', () => {
  it('offers the native install and single-skill update commands for the selected runtime', () => {
    renderToStaticMarkup(
      <BrowserUseSkillStep
        skillDetected
        skillLoading={false}
        skillError={null}
        onRecheck={vi.fn()}
      />
    )

    expect(capturedPanel.props).toEqual(
      expect.objectContaining({
        command: ORCA_CLI_SKILL_INSTALL_COMMAND,
        installedCommand: ORCA_CLI_SKILL_UPDATE_COMMAND,
        installed: true
      })
    )
  })
})
