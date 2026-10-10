import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { translate } from '@/i18n/i18n'
import { Label } from '../ui/label'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitch } from './SettingsFormControls'
import { getExperimentalSearchEntry } from './experimental-search'

type AgentDashboardExperimentalSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function AgentDashboardExperimentalSetting({
  settings,
  updateSettings
}: AgentDashboardExperimentalSettingProps): React.JSX.Element {
  const enabled = settings.experimentalAgentDashboardPopout === true

  return (
    <SearchableSetting
      title={translate(
        'auto.components.settings.ExperimentalPane.agentDashboard.title',
        'Agent Dashboard'
      )}
      description={translate(
        'auto.components.settings.ExperimentalPane.agentDashboard.description',
        'Kanban board for monitoring agents across worktrees, in-window or as a pop-out.'
      )}
      keywords={getExperimentalSearchEntry().agentDashboard.keywords}
      className="space-y-3 py-2"
      id="experimental-agent-dashboard"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 shrink space-y-0.5">
          <Label>
            {translate(
              'auto.components.settings.ExperimentalPane.agentDashboard.title',
              'Agent Dashboard'
            )}
          </Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.ExperimentalPane.agentDashboard.copy',
              'Adds an Agent Dashboard entry to the left sidebar. Monitor agents that need you, are working, or are done, with optional idle agents.'
            )}
          </p>
        </div>
        <SettingsSwitch
          checked={enabled}
          ariaLabel={translate(
            'auto.components.settings.ExperimentalPane.agentDashboard.toggleLabel',
            'Toggle Agent Dashboard'
          )}
          onChange={() => updateSettings({ experimentalAgentDashboardPopout: !enabled })}
        />
      </div>
    </SearchableSetting>
  )
}
