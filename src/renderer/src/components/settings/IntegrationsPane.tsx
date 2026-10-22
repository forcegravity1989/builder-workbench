import {
  CloudBuildIntegrationCard,
  CodeHubIntegrationCard,
  GitHubIntegrationCard,
  WeLinkIntegrationCard
} from './source-control-integration-cards'
import { useIntegrationProviderStatusRefresh } from './use-integration-provider-status-refresh'
import { translate } from '@/i18n/i18n'
export { getIntegrationsPaneSearchEntries } from './integrations-search'

// Why (BW #323): the pane collapses to the CLIs the BW workflow depends on.
// The six hidden cards' components stay in the codebase per intent 待决 1
// (kept — human decision 2026-10-16); only this render list changes.
// CloudBuild (BW #366) joins as its own build group — it is neither source
// control nor project-group messaging.
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

      <section className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">
            {translate('auto.components.settings.IntegrationsPane.buildGroupTitle', 'Build')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.IntegrationsPane.buildGroupDescription',
              'CLIs for pipeline execution and package builds.'
            )}
          </p>
        </div>
        <div className="space-y-3">
          <CloudBuildIntegrationCard />
        </div>
      </section>
    </div>
  )
}
