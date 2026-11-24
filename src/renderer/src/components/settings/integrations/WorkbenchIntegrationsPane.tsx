import {
  CloudBuildIntegrationCard,
  CodeHubIntegrationCard,
  WeLinkIntegrationCard
} from '../bw-cli-integration-cards'
import { GitHubIntegrationCard } from '../../integrations/source-control/cli-source-control-integration-cards'
import { useTranslate } from '@/i18n/use-translate'

export function WorkbenchIntegrationsPane(): React.JSX.Element {
  const t = useTranslate()
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">
            {t('auto.components.settings.IntegrationsPane.codeHostGroupTitle', 'Code hosting')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t(
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
            {t('auto.components.settings.IntegrationsPane.imGroupTitle', 'Reports and diagnostics')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t(
              'auto.components.settings.IntegrationsPane.imGroupDescription',
              'Send reports and diagnostic files to the BW user-group space.'
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
            {t('auto.components.settings.IntegrationsPane.buildGroupTitle', 'Build')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t(
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
