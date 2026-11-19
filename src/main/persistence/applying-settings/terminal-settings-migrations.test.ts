import { describe, expect, it } from 'vitest'
import {
  migrateAgentYoloDefaults,
  stripRetiredGlobalSettings
} from './terminal-settings-migrations'

describe('migrateAgentYoloDefaults', () => {
  it('keeps newly added agent defaults manual for already migrated profiles', () => {
    const migrated = migrateAgentYoloDefaults({
      agentYoloDefaultsMigrated: true,
      agentDefaultArgs: { claude: '--dangerously-skip-permissions' },
      agentDefaultEnv: {}
    } as never)

    expect(migrated.agentDefaultArgs?.droid).toBe('')
    expect(migrated.agentDefaultEnv?.goose).toEqual({})
  })
})

describe('stripRetiredGlobalSettings', () => {
  it('drops the retired artifact switches and keeps live settings', () => {
    const stripped = stripRetiredGlobalSettings({
      artifactsEnabled: true,
      artifactSharingEnabled: true,
      showArtifactsButton: true,
      skipDeleteArtifactConfirm: true,
      // Retired before this feature, still stripped on the same path.
      showAgentsSidebar: true,
      terminalScrollbackBytes: 1000,
      enableGitHubAttribution: false,
      // Live settings must survive: skill cloud sharing is a retained feature.
      agentSkillSharingEnabled: false,
      theme: 'dark'
    } as never)

    for (const retired of [
      'artifactsEnabled',
      'artifactSharingEnabled',
      'showArtifactsButton',
      'skipDeleteArtifactConfirm',
      'showAgentsSidebar',
      'terminalScrollbackBytes',
      'enableGitHubAttribution'
    ]) {
      expect(stripped).not.toHaveProperty(retired)
    }
    expect(stripped).toMatchObject({ agentSkillSharingEnabled: false, theme: 'dark' })
  })
})
