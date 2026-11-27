import { ArtifactsSharedLinksSection } from '../ArtifactsSharedLinksSection'
import { translate } from '@/i18n/i18n'
import { isWebClientLocation } from '@/app-shell/platform/web-client-location'

type HowToStep = { key: string; title: string; description: string }

export function WorkbenchArtifactsSettingsPane(): React.JSX.Element {
  // The shared-files list is kept by the host app, so web clients only get the pointer.
  const isWebClient = isWebClientLocation()
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
        'auto.components.settings.artifacts.workbenchManageStepTitle',
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
      {isWebClient ? (
        <section className="space-y-1 py-5">
          <h3 className="text-sm font-medium">
            {translate(
              'auto.components.settings.artifacts.sharedLinksTitle',
              "Files you've shared"
            )}
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {translate(
              'auto.components.settings.artifacts.sharedLinksWebDescription',
              'Desktop only. Open Settings → Artifacts on the host device to see and delete your shared links.'
            )}
          </p>
        </section>
      ) : (
        <ArtifactsSharedLinksSection />
      )}
    </div>
  )
}
