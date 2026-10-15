import { useState } from 'react'
import { MessageSquare, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IntegrationCardShell } from './integration-card-shell'
import { useIntegrationCommandRowClass } from './integration-card-presentation'
import { usePreflightCardStatuses } from './source-control-preflight-card-status'
import { translate } from '@/i18n/i18n'
import {
  injectCliCommandIntoTerminal,
  useCanInjectCliCommand
} from './cli-command-injection'
import {
  integrationStatusLabel,
  ProviderAccountScopeDetails
} from './cli-source-control-integration-cards'

// Why (BW #323): CodeHub and WeLink are BW-only CLIs, so their cards live in a
// BW file instead of growing the upstream card module past its line budget.
// The barrel re-exports them next to the upstream cards.

// Why (BW #323): the install command confirmed by the user (2026-10-15). It
// carries the internal npm registry and strict-ssl flags inline so no machine
// pre-configuration is needed; the same-named public npm package is an
// unrelated tool, so the registry flag is load-bearing, not cosmetic.
const WELINK_CLI_INSTALL_COMMAND =
  'npm install -g @welink/welink-cli --registry=https://cmc.centralrepo.rnd.huawei.com/artifactory/api/npm/product_npm/ --strict-ssl=false'

export function CodeHubIntegrationCard(): React.JSX.Element {
  const { statuses, unavailable, refresh } = usePreflightCardStatuses('codehub')
  const status = unavailable ? 'unavailable' : statuses.codehubStatus
  const connected = status === 'connected'
  const commandRowClass = useIntegrationCommandRowClass()
  const canInject = useCanInjectCliCommand()
  const [injected, setInjected] = useState(false)

  return (
    <IntegrationCardShell
      icon={<Terminal className="size-5" />}
      name="CodeHub"
      description={
        <>
          {translate(
            'auto.components.settings.cli.source.control.integration.cards.codehubDescription',
            'Issues and merge requests via the'
          )}{' '}
          <span className="font-mono text-[11px]">codehub-cli</span>{' '}
          {translate(
            'auto.components.settings.cli.source.control.integration.cards.a47f71e357',
            'CLI.'
          )}
        </>
      }
      checking={status === 'checking'}
      statusTone={connected ? 'connected' : 'attention'}
      statusLabel={integrationStatusLabel(status)}
    >
      <ProviderAccountScopeDetails>
        {status !== 'checking' && !connected ? (
          status === 'unavailable' ? (
            <>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.settings.cli.source.control.integration.cards.codehubUnavailable',
                  'codehub-cli status is not available in this runtime yet.'
                )}
              </p>
              <Button variant="ghost" size="sm" onClick={refresh}>
                {translate(
                  'auto.components.settings.cli.source.control.integration.cards.d5b3be8ecd',
                  'Re-check'
                )}
              </Button>
            </>
          ) : status === 'not-installed' ? (
            <>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.settings.cli.source.control.integration.cards.codehubMissing',
                  'codehub-cli is not on PATH.'
                )}
              </p>
              {/* Why: the install command is not confirmed yet (BW #323 待决 2);
                  an honest note beats a button that guesses. */}
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.settings.cli.source.control.integration.cards.codehubInstallPending',
                  'The install command is pending internal confirmation and will appear here once decided.'
                )}
              </p>
              <Button variant="ghost" size="sm" onClick={refresh}>
                {translate(
                  'auto.components.settings.cli.source.control.integration.cards.d5b3be8ecd',
                  'Re-check'
                )}
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.settings.cli.source.control.integration.cards.codehubNotAuthenticated',
                  'codehub-cli is installed but not authenticated.'
                )}
              </p>
              <div className={commandRowClass}>
                <Terminal className="size-3.5 shrink-0 text-muted-foreground" />
                {translate(
                  'auto.components.settings.cli.source.control.integration.cards.codehubAuthLoginCommand',
                  'codehub-cli auth login'
                )}
              </div>
              {injected ? (
                <p className="text-xs text-muted-foreground">
                  {translate(
                    'auto.components.settings.cli.source.control.integration.cards.commandInjectedNote',
                    'The command is running in a new terminal tab. Re-check here when it finishes.'
                  )}
                </p>
              ) : null}
              <div className="flex items-center gap-2">
                {canInject ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      injectCliCommandIntoTerminal('codehub-cli auth login')
                      setInjected(true)
                    }}
                  >
                    {translate(
                      'auto.components.settings.cli.source.control.integration.cards.loginButton',
                      'Log in'
                    )}
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={refresh}>
                  {translate(
                    'auto.components.settings.cli.source.control.integration.cards.d5b3be8ecd',
                    'Re-check'
                  )}
                </Button>
              </div>
            </>
          )
        ) : null}
      </ProviderAccountScopeDetails>
    </IntegrationCardShell>
  )
}

export function WeLinkIntegrationCard(): React.JSX.Element {
  const { statuses, unavailable, refresh } = usePreflightCardStatuses('welink')
  const status = unavailable ? 'unavailable' : statuses.welinkStatus
  const connected = status === 'connected'
  const commandRowClass = useIntegrationCommandRowClass()
  const canInject = useCanInjectCliCommand()
  const [injected, setInjected] = useState(false)

  return (
    <IntegrationCardShell
      icon={<MessageSquare className="size-5" />}
      name="WeLink"
      description={
        <>
          {translate(
            'auto.components.settings.cli.source.control.integration.cards.welinkDescription',
            'Project group notifications via the'
          )}{' '}
          <span className="font-mono text-[11px]">welink-cli</span>{' '}
          {translate(
            'auto.components.settings.cli.source.control.integration.cards.a47f71e357',
            'CLI.'
          )}
        </>
      }
      checking={status === 'checking'}
      statusTone={connected ? 'connected' : 'attention'}
      statusLabel={integrationStatusLabel(status)}
    >
      <ProviderAccountScopeDetails>
        {status !== 'checking' && !connected ? (
          status === 'unavailable' ? (
            <>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.settings.cli.source.control.integration.cards.welinkUnavailable',
                  'welink-cli status is not available in this runtime yet.'
                )}
              </p>
              <Button variant="ghost" size="sm" onClick={refresh}>
                {translate(
                  'auto.components.settings.cli.source.control.integration.cards.d5b3be8ecd',
                  'Re-check'
                )}
              </Button>
            </>
          ) : status === 'not-installed' ? (
            <>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.settings.cli.source.control.integration.cards.welinkMissing',
                  'Install welink-cli to enable project group notifications.'
                )}
              </p>
              {injected ? (
                <p className="text-xs text-muted-foreground">
                  {translate(
                    'auto.components.settings.cli.source.control.integration.cards.commandInjectedNote',
                    'The command is running in a new terminal tab. Re-check here when it finishes.'
                  )}
                </p>
              ) : null}
              <div className="flex items-center gap-2">
                {canInject ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      injectCliCommandIntoTerminal(WELINK_CLI_INSTALL_COMMAND)
                      setInjected(true)
                    }}
                  >
                    {translate(
                      'auto.components.settings.cli.source.control.integration.cards.welinkInstallButton',
                      'Install WeLink CLI'
                    )}
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={refresh}>
                  {translate(
                    'auto.components.settings.cli.source.control.integration.cards.d5b3be8ecd',
                    'Re-check'
                  )}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.settings.cli.source.control.integration.cards.welinkNotAuthenticated',
                  'welink-cli is installed but not authenticated.'
                )}
              </p>
              <div className={commandRowClass}>
                <Terminal className="size-3.5 shrink-0 text-muted-foreground" />
                {translate(
                  'auto.components.settings.cli.source.control.integration.cards.welinkAuthLoginCommand',
                  'welink-cli auth login'
                )}
              </div>
              {injected ? (
                <p className="text-xs text-muted-foreground">
                  {translate(
                    'auto.components.settings.cli.source.control.integration.cards.commandInjectedNote',
                    'The command is running in a new terminal tab. Re-check here when it finishes.'
                  )}
                </p>
              ) : null}
              <div className="flex items-center gap-2">
                {canInject ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      injectCliCommandIntoTerminal('welink-cli auth login')
                      setInjected(true)
                    }}
                  >
                    {translate(
                      'auto.components.settings.cli.source.control.integration.cards.loginButton',
                      'Log in'
                    )}
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={refresh}>
                  {translate(
                    'auto.components.settings.cli.source.control.integration.cards.d5b3be8ecd',
                    'Re-check'
                  )}
                </Button>
              </div>
            </>
          )
        ) : null}
      </ProviderAccountScopeDetails>
    </IntegrationCardShell>
  )
}
