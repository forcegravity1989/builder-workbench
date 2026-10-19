import { useState } from 'react'
import { ExternalLink, Github, Gitlab, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { IntegrationCardDetails, IntegrationCardShell } from './integration-card-shell'
import {
  useIntegrationCommandRowClass,
  useIntegrationSubordinateRowClass
} from './integration-card-presentation'
import { getProviderAccountScope } from './provider-account-scope'
import { ProviderHostScopeControl } from './ProviderHostScopeControl'
import { usePreflightCardStatuses } from './source-control-preflight-card-status'
import { translate } from '@/i18n/i18n'
import { OnboardingInlineCommandTerminal } from '../onboarding/OnboardingInlineCommandTerminal'
import { useIsLocalCliScope } from './use-local-cli-scope'

export function integrationStatusLabel(
  status: 'connected' | 'unavailable' | 'not-installed' | 'not-authenticated' | 'checking'
): string {
  switch (status) {
    case 'connected':
      return translate(
        'auto.components.settings.cli.source.control.integration.cards.statusConnected',
        'Connected'
      )
    case 'unavailable':
      return translate(
        'auto.components.settings.cli.source.control.integration.cards.statusUnavailable',
        'Unavailable'
      )
    case 'not-installed':
      return translate(
        'auto.components.settings.cli.source.control.integration.cards.statusNotInstalled',
        'Not installed'
      )
    case 'not-authenticated':
      return translate(
        'auto.components.settings.cli.source.control.integration.cards.statusNotAuthenticated',
        'Not authenticated'
      )
    case 'checking':
      return ''
  }
}

export function ProviderAccountScopeDetails({
  children
}: {
  children?: React.ReactNode
}): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const accountScope = getProviderAccountScope(settings)
  const subordinateRowClass = useIntegrationSubordinateRowClass('text-xs')

  return (
    <IntegrationCardDetails>
      {/* Why (BW #323): the Open Remote Servers shortcut is dropped from the
          source-control integration cards per the user decision (2026-10-16);
          the scope label stays to say whose status the card reports. */}
      <ProviderHostScopeControl
        labelPrefix={translate(
          'auto.components.settings.cli.source.control.integration.cards.account_scope_prefix',
          'Account scope'
        )}
        scope={accountScope}
        className={subordinateRowClass}
        showChangeHostAction={false}
      />
      {children}
    </IntegrationCardDetails>
  )
}

export function GitHubIntegrationCard(): React.JSX.Element {
  const { statuses, unavailable, refresh } = usePreflightCardStatuses('gh')
  const status = unavailable ? 'unavailable' : statuses.ghStatus
  const connected = status === 'connected'
  const commandRowClass = useIntegrationCommandRowClass()
  const isLocalScope = useIsLocalCliScope()
  // Why (BW #323): login runs in the card-embedded inline terminal (user
  // decision 2026-10-19 — reverses the floating-terminal injection; the
  // upstream OnboardingInlineCommandTerminal pastes the command and the
  // human presses Enter, per the issue's original form).
  const [loginTerminalOpen, setLoginTerminalOpen] = useState(false)
  // Why (BW #323): remount key so clicking Log in again starts a fresh
  // session (new tab + fresh injection) instead of no-oping while the
  // terminal is already open.
  const [loginAttempt, setLoginAttempt] = useState(0)

  return (
    <IntegrationCardShell
      icon={<Github className="size-5" />}
      name="GitHub"
      description={
        <>
          {translate(
            'auto.components.settings.cli.source.control.integration.cards.b4d900e7f1',
            'Pull requests, issues, and checks via the'
          )}{' '}
          <span className="font-mono text-[11px]">
            {translate(
              'auto.components.settings.cli.source.control.integration.cards.6b2cfb52b4',
              'gh'
            )}
          </span>{' '}
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
                  'auto.components.settings.cli.source.control.integration.cards.6f30fc4216',
                  'GitHub CLI status is not available in this runtime yet.'
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
                  'auto.components.settings.cli.source.control.integration.cards.23cb5a0dee',
                  'Install the GitHub CLI to enable pull requests, issues, and checks.'
                )}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.api.shell.openUrl('https://cli.github.com')}
                >
                  <ExternalLink className="size-3.5 mr-1.5" />
                  {translate(
                    'auto.components.settings.cli.source.control.integration.cards.7755c28af5',
                    'Install GitHub CLI'
                  )}
                </Button>
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
                  'auto.components.settings.cli.source.control.integration.cards.2e44dda68a',
                  'The GitHub CLI is installed but not authenticated. Run this command in a terminal:'
                )}
              </p>
              <div className={commandRowClass}>
                <Terminal className="size-3.5 shrink-0 text-muted-foreground" />
                {translate(
                  'auto.components.settings.cli.source.control.integration.cards.8d90249d22',
                  'gh auth login'
                )}
              </div>
              <div className="flex items-center gap-2">
                {isLocalScope ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setLoginTerminalOpen(true)
                      setLoginAttempt((n) => n + 1)
                    }}
                  >
                    {translate(
                      'auto.components.settings.cli.source.control.integration.cards.loginButton',
                      'Log in'
                    )}
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    window.api.shell.openUrl('https://cli.github.com/manual/gh_auth_login')
                  }
                >
                  <ExternalLink className="size-3.5 mr-1.5" />
                  {translate(
                    'auto.components.settings.cli.source.control.integration.cards.8cbc39f862',
                    'Learn more'
                  )}
                </Button>
                <Button variant="ghost" size="sm" onClick={refresh}>
                  {translate(
                    'auto.components.settings.cli.source.control.integration.cards.d5b3be8ecd',
                    'Re-check'
                  )}
                </Button>
              </div>
            </>
          )
        ) : connected ? (
          // Why (BW #323): spec — connected cards keep only Re-check (I10
          // re-verification); the upstream pattern rendered no action at all.
          <Button variant="ghost" size="sm" onClick={refresh}>
            {translate(
              'auto.components.settings.cli.source.control.integration.cards.d5b3be8ecd',
              'Re-check'
            )}
          </Button>
        ) : null}
        {/* Why (BW #323): the login terminal lives outside the status ternary
            so a re-check's brief `checking` flip cannot unmount it — a failed
            login must leave its error on screen (user decision 2026-10-19),
            and the auto re-check after the command ends would otherwise close
            and reopen the terminal with a fresh injection, flashing the error
            away. It unmounts only when the login succeeds (connected) or the
            shell exits. */}
        {loginTerminalOpen && !connected ? (
          <OnboardingInlineCommandTerminal
            key={loginAttempt}
            command="gh auth login"
            title={translate(
              'auto.components.settings.cli.source.control.integration.cards.ghLoginTitle',
              'GitHub login'
            )}
            description={translate(
              'auto.components.settings.cli.source.control.integration.cards.pressEnterDescription',
              'Press Enter to run the command.'
            )}
            ariaLabel={translate(
              'auto.components.settings.cli.source.control.integration.cards.ghLoginTerminalAriaLabel',
              'GitHub login terminal'
            )}
            worktreeId="connectors-gh-login"
            terminalTopMarginPx={8}
            onTerminalExit={() => {
              setLoginTerminalOpen(false)
            }}
            onCommandFinished={() => {
              refresh()
            }}
          />
        ) : null}
      </ProviderAccountScopeDetails>
    </IntegrationCardShell>
  )
}

export function GitLabIntegrationCard(): React.JSX.Element {
  const { statuses, unavailable, refresh } = usePreflightCardStatuses('glab')
  const status = unavailable ? 'unavailable' : statuses.glabStatus
  const connected = status === 'connected'
  const commandRowClass = useIntegrationCommandRowClass()

  return (
    <IntegrationCardShell
      icon={<Gitlab className="size-5" />}
      name="GitLab"
      description={
        <>
          {translate(
            'auto.components.settings.cli.source.control.integration.cards.1f2b347bd3',
            'Merge requests, issues, todos, and pipelines via the'
          )}{' '}
          <span className="font-mono text-[11px]">
            {translate(
              'auto.components.settings.cli.source.control.integration.cards.2a6b359e75',
              'glab'
            )}
          </span>{' '}
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
                  'auto.components.settings.cli.source.control.integration.cards.faddeb763d',
                  'GitLab CLI status is not available in this runtime yet.'
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
                  'auto.components.settings.cli.source.control.integration.cards.b56fd5676a',
                  'Install the GitLab CLI to enable merge requests, issues, and pipelines.'
                )}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    window.api.shell.openUrl('https://gitlab.com/gitlab-org/cli#installation')
                  }
                >
                  <ExternalLink className="size-3.5 mr-1.5" />
                  {translate(
                    'auto.components.settings.cli.source.control.integration.cards.54a640af7a',
                    'Install GitLab CLI'
                  )}
                </Button>
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
                  'auto.components.settings.cli.source.control.integration.cards.4be0616873',
                  'The GitLab CLI is installed but not authenticated. Run this command in a terminal:'
                )}
              </p>
              <div className={commandRowClass}>
                <Terminal className="size-3.5 shrink-0 text-muted-foreground" />
                {translate(
                  'auto.components.settings.cli.source.control.integration.cards.707180d09c',
                  'glab auth login'
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    window.api.shell.openUrl(
                      'https://gitlab.com/gitlab-org/cli/-/blob/main/docs/source/auth/login.md'
                    )
                  }
                >
                  <ExternalLink className="size-3.5 mr-1.5" />
                  {translate(
                    'auto.components.settings.cli.source.control.integration.cards.8cbc39f862',
                    'Learn more'
                  )}
                </Button>
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
