import { Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import {
  cliDescription,
  integrationStatusLabel,
  reCheckLabel,
  useSetupRunsWhereStatusIsChecked,
  useSetupStep
} from './cli-integration-card-parts'
import { IntegrationCardDetails, IntegrationCardShell } from './integration-card-shell'
import { CODEHUB_AUTH_STATUS_COMMAND, integrationSignInCommand } from './integration-setup-commands'
import { IntegrationSetupTerminal } from './IntegrationSetupTerminal'
import { usePreflightCardStatuses } from './source-control-preflight-card-status'

export function CodeHubIntegrationCard(): React.JSX.Element {
  const { statuses, unavailable, refresh } = usePreflightCardStatuses('codehub')
  const status = unavailable ? 'unavailable' : statuses.codehubStatus
  const available = status === 'available'
  const setup = useSetupStep()
  const canSetup = useSetupRunsWhereStatusIsChecked()
  const signInLabel = translate(
    'auto.components.settings.cli.source.control.integration.cards.signIn',
    'Sign in'
  )
  const statusCheckLabel = translate(
    'auto.components.settings.cli.source.control.integration.cards.codehubAuthStatus',
    'Check sign-in'
  )

  return (
    <IntegrationCardShell
      icon={<Terminal className="size-5" />}
      name="CodeHub"
      description={cliDescription(
        translate(
          'auto.components.settings.cli.source.control.integration.cards.codehubDescription',
          'Issues and merge requests via the'
        ),
        'codehub-cli'
      )}
      checking={status === 'checking'}
      statusTone={available ? 'connected' : 'attention'}
      statusLabel={
        status === 'available'
          ? translate(
              'auto.components.settings.cli.source.control.integration.cards.codehubAvailable',
              'Available'
            )
          : status === 'unavailable'
            ? integrationStatusLabel('unavailable')
            : status === 'checking'
              ? ''
              : integrationStatusLabel('not-installed')
      }
    >
      {setup.step ? (
        // Why: the terminal must outlive the re-check it triggers; unmounting it
        // closes the tab and drops the output the user is reading.
        <IntegrationCardDetails>
          <IntegrationSetupTerminal
            id="codehub"
            command={setup.step.command}
            title={setup.step.title}
            onCheck={refresh}
            onClose={setup.close}
          />
        </IntegrationCardDetails>
      ) : status === 'checking' ? null : (
        <IntegrationCardDetails>
          {available ? (
            // Why: preflight only checks PATH for codehub-cli; sign-in is not probed.
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.settings.cli.source.control.integration.cards.codehubSignInHint',
                'Sign-in is not checked automatically.'
              )}
            </p>
          ) : status === 'unavailable' ? (
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.settings.cli.source.control.integration.cards.codehubUnavailable',
                'codehub-cli status is not available in this runtime yet.'
              )}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.settings.cli.source.control.integration.cards.codehubMissing',
                'codehub-cli is not on PATH.'
              )}{' '}
              {translate(
                'auto.components.settings.cli.source.control.integration.cards.codehubMissingNext',
                'Get it from your team’s distribution channel, then re-check.'
              )}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {available && canSetup ? (
              <>
                <Button
                  size="sm"
                  onClick={() =>
                    setup.open(integrationSignInCommand('codehub'), `${signInLabel} · CodeHub`)
                  }
                >
                  {signInLabel}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setup.open(CODEHUB_AUTH_STATUS_COMMAND, statusCheckLabel)}
                >
                  {statusCheckLabel}
                </Button>
              </>
            ) : null}
            <Button variant="ghost" size="sm" onClick={refresh}>
              {reCheckLabel()}
            </Button>
          </div>
        </IntegrationCardDetails>
      )}
    </IntegrationCardShell>
  )
}
