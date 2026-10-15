import {
  CodeHubIntegrationCard,
  GitHubIntegrationCard,
  WeLinkIntegrationCard
} from './source-control-integration-cards'
import { useIntegrationProviderStatusRefresh } from './use-integration-provider-status-refresh'
import { translate } from '@/i18n/i18n'
export { getIntegrationsPaneSearchEntries } from './integrations-search'

// Why (BW #323): the pane collapses to the three CLIs the BW workflow depends
// on. The six hidden cards' components stay in the codebase pending 待决 1
// (six-card code keep-or-drop); only this render list changes.
export function IntegrationsPane(): React.JSX.Element {
  useIntegrationProviderStatusRefresh()

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">
            {translate(
              'auto.components.settings.IntegrationsPane.codeHostGroupTitle',
              'Code hosting'
            )}
          </h3>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.IntegrationsPane.codeHostGroupDescription',
              'CLIs for tasks, pull requests, merge requests, and review status.'
            )}
          </p>
        </div>
        <div className="space-y-3">
          <GitHubIntegrationCard />
          <CodeHubIntegrationCard />
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">
            {translate('auto.components.settings.IntegrationsPane.imGroupTitle', 'Project group')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.IntegrationsPane.imGroupDescription',
              'CLIs for posting version and acceptance updates to the project group.'
            )}
          </p>
        </div>
        <div className="space-y-3">
          <WeLinkIntegrationCard />
        </div>
      </section>
    </div>
  )
}
