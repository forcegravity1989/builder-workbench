import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { SettingsSwitchRow } from './SettingsFormControls'
import { ShareServerSettingsSection } from './ShareServerSettingsSection'
import { translate } from '@/i18n/i18n'
import { isWebClientLocation } from '@/lib/web-client-location'

type HowToStep = { key: string; title: string; description: string }

export function ArtifactsSettingsPane({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => Promise<void>
}): React.JSX.Element {
  // The Artifacts page and CLI still publish through Orca's cloud service, and this host-side
  // capability is their only grant path, so it stays until they move to the self-hosted service.
  const isWebClient = isWebClientLocation()
  const sharingEnabled = settings.artifactSharingEnabled === true
  const howToSteps: HowToStep[] = [
    {
      key: 'share',
      title: translate(
        'auto.components.settings.artifacts.shareStepTitle',
        'Choose a file to share'
      ),
      description: translate(
        'auto.components.settings.artifacts.shareStepDescription',
        'Open an HTML or Markdown file and select Share as artifact, or ask an agent to share it.'
      )
    },
    {
      key: 'link',
      title: translate('auto.components.settings.artifacts.linkStepTitle', 'Copy the public link'),
      description: translate(
        'auto.components.settings.artifacts.linkStepDescription',
        'After publishing, copy the link and send it to your team.'
      )
    },
    {
      key: 'manage',
      title: translate(
        'auto.components.settings.artifacts.manageStepTitle',
        'Update or remove the link'
      ),
      description: translate(
        'auto.components.settings.artifacts.manageStepDescriptionV2',
        'Reopen the same file and use Share as artifact to publish new content over the same link.'
      )
    }
  ]

  return (
    <div className="divide-y divide-border">
      <SettingsSwitchRow
        label={translate(
          'auto.components.settings.artifacts.allowPublishing',
          'Allow publishing public artifact links'
        )}
        description={
          isWebClient
            ? translate(
                'auto.components.settings.artifacts.allowPublishingWebDescription',
                'Desktop only. Open Settings → Artifacts on the host device to change this setting.'
              )
            : translate(
                'auto.components.settings.artifacts.allowPublishingDescription',
                'Publish HTML and Markdown files as links anyone with the URL can open. Existing links remain until you delete them from Artifacts.'
              )
        }
        checked={sharingEnabled}
        disabled={isWebClient}
        onChange={() => void updateSettings({ artifactSharingEnabled: !sharingEnabled })}
      />
      <SettingsSwitchRow
        label={translate('auto.components.settings.artifacts.showButton', 'Show Artifacts Button')}
        description={translate(
          'auto.components.settings.artifacts.showButtonDescription',
          'Show the Artifacts shortcut in the sidebar.'
        )}
        checked={settings.showArtifactsButton === true}
        onChange={() => void updateSettings({ showArtifactsButton: !settings.showArtifactsButton })}
      />
      <ShareServerSettingsSection />
      <section className="space-y-4 py-5">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">
            {translate('auto.components.settings.artifacts.howToTitle', 'How to use Artifacts')}
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {translate(
              'auto.components.settings.artifacts.howToDescription',
              'Publish HTML or Markdown files as public links, then share them with your team.'
            )}
          </p>
        </div>

        <ol className="space-y-3">
          {howToSteps.map((step, index) => (
            <li key={step.key} className="flex items-start gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/30 text-[11px] font-semibold text-muted-foreground">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm font-medium">{step.title}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
