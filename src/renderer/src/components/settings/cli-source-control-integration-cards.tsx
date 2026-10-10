import { ExternalLink, Github, Gitlab, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import {
  cliDescription,
  integrationStatusLabel,
  reCheckLabel,
  useSetupRunsWhereStatusIsChecked,
  useSetupStep
} from './cli-integration-card-parts'
import { IntegrationCardDetails, IntegrationCardShell } from './integration-card-shell'
import {
  useIntegrationCommandRowClass,
  useIntegrationSubordinateRowClass
} from './integration-card-presentation'
import {
  integrationInstallCommand,
  integrationSignInCommand,
  type IntegrationCliProvider
} from './integration-setup-commands'
import { IntegrationSetupTerminal } from './IntegrationSetupTerminal'
import { getProviderAccountScope } from './provider-account-scope'
import { ProviderHostScopeControl } from './ProviderHostScopeControl'
import {
  usePreflightCardStatuses,
  type CliProviderCardState
} from './source-control-preflight-card-status'
import { translate } from '@/i18n/i18n'

export { CodeHubIntegrationCard } from './codehub-integration-card'

function ProviderAccountScopeDetails({
  children
}: {
  children?: React.ReactNode
}): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const accountScope = getProviderAccountScope(settings)
  const subordinateRowClass = useIntegrationSubordinateRowClass('text-xs')

  return (
    <IntegrationCardDetails>
      <ProviderHostScopeControl
        labelPrefix={translate(
          'auto.components.settings.cli.source.control.integration.cards.account_scope_prefix',
          'Account scope'
        )}
        scope={accountScope}
        className={subordinateRowClass}
      />
      {children}
    </IntegrationCardDetails>
  )
}

type CliProviderCopy = {
  provider: Extract<IntegrationCliProvider, 'gh' | 'glab'>
  name: string
  icon: React.ReactNode
  description: React.ReactNode
  unavailable: string
  notInstalled: string
  installLabel: string
  installDocsUrl: string
  notAuthenticated: string
  authDocsUrl: string
}

function CliProviderCard({ copy }: { copy: CliProviderCopy }): React.JSX.Element {
  const { statuses, unavailable, refresh } = usePreflightCardStatuses(copy.provider)
  const status: CliProviderCardState = unavailable
    ? 'unavailable'
    : copy.provider === 'gh'
      ? statuses.ghStatus
      : statuses.glabStatus
  const connected = status === 'connected'
  const commandRowClass = useIntegrationCommandRowClass()
  const setup = useSetupStep()
  const canSetup = useSetupRunsWhereStatusIsChecked()
  const installCommand = integrationInstallCommand(
    copy.provider,
    window.api.platform.get().platform
  )
  const signInCommand = integrationSignInCommand(copy.provider)
  const signInLabel = translate(
    'auto.components.settings.cli.source.control.integration.cards.signIn',
    'Sign in'
  )

  const body = setup.step ? (
    <IntegrationSetupTerminal
      id={copy.provider}
      command={setup.step.command}
      title={setup.step.title}
      onCheck={refresh}
      onClose={setup.close}
    />
  ) : status === 'checking' || connected ? null : status === 'unavailable' ? (
    <>
      <p className="text-xs text-muted-foreground">{copy.unavailable}</p>
      <Button variant="ghost" size="sm" onClick={refresh}>
        {reCheckLabel()}
      </Button>
    </>
  ) : status === 'not-installed' ? (
    <>
      <p className="text-xs text-muted-foreground">{copy.notInstalled}</p>
      {installCommand ? (
        <div className={commandRowClass}>
          <Terminal className="size-3.5 shrink-0 text-muted-foreground" />
          {installCommand}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {installCommand && canSetup ? (
          <Button size="sm" onClick={() => setup.open(installCommand, copy.installLabel)}>
            {copy.installLabel}
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.api.shell.openUrl(copy.installDocsUrl)}
        >
          <ExternalLink className="size-3.5 mr-1.5" />
          {translate(
            'auto.components.settings.cli.source.control.integration.cards.installGuide',
            'Install guide'
          )}
        </Button>
        <Button variant="ghost" size="sm" onClick={refresh}>
          {reCheckLabel()}
        </Button>
      </div>
    </>
  ) : (
    <>
      <p className="text-xs text-muted-foreground">{copy.notAuthenticated}</p>
      <div className={commandRowClass}>
        <Terminal className="size-3.5 shrink-0 text-muted-foreground" />
        {signInCommand}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canSetup ? (
          <Button
            size="sm"
            onClick={() => setup.open(signInCommand, `${signInLabel} · ${copy.name}`)}
          >
            {signInLabel}
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.api.shell.openUrl(copy.authDocsUrl)}
        >
          <ExternalLink className="size-3.5 mr-1.5" />
          {translate(
            'auto.components.settings.cli.source.control.integration.cards.8cbc39f862',
            'Learn more'
          )}
        </Button>
        <Button variant="ghost" size="sm" onClick={refresh}>
          {reCheckLabel()}
        </Button>
      </div>
    </>
  )

  return (
    <IntegrationCardShell
      icon={copy.icon}
      name={copy.name}
      description={copy.description}
      checking={status === 'checking'}
      statusTone={connected ? 'connected' : 'attention'}
      statusLabel={integrationStatusLabel(status)}
    >
      <ProviderAccountScopeDetails>{body}</ProviderAccountScopeDetails>
    </IntegrationCardShell>
  )
}

export function GitHubIntegrationCard(): React.JSX.Element {
  return (
    <CliProviderCard
      copy={{
        provider: 'gh',
        name: 'GitHub',
        icon: <Github className="size-5" />,
        description: cliDescription(
          translate(
            'auto.components.settings.cli.source.control.integration.cards.b4d900e7f1',
            'Pull requests, issues, and checks via the'
          ),
          translate(
            'auto.components.settings.cli.source.control.integration.cards.6b2cfb52b4',
            'gh'
          )
        ),
        unavailable: translate(
          'auto.components.settings.cli.source.control.integration.cards.6f30fc4216',
          'GitHub CLI status is not available in this runtime yet.'
        ),
        notInstalled: translate(
          'auto.components.settings.cli.source.control.integration.cards.23cb5a0dee',
          'Install the GitHub CLI to enable pull requests, issues, and checks.'
        ),
        installLabel: translate(
          'auto.components.settings.cli.source.control.integration.cards.7755c28af5',
          'Install GitHub CLI'
        ),
        installDocsUrl: 'https://cli.github.com',
        notAuthenticated: translate(
          'auto.components.settings.cli.source.control.integration.cards.ghSignInNeeded',
          'The GitHub CLI is installed but not signed in. You can also run this in any terminal:'
        ),
        authDocsUrl: 'https://cli.github.com/manual/gh_auth_login'
      }}
    />
  )
}

export function GitLabIntegrationCard(): React.JSX.Element {
  return (
    <CliProviderCard
      copy={{
        provider: 'glab',
        name: 'GitLab',
        icon: <Gitlab className="size-5" />,
        description: cliDescription(
          translate(
            'auto.components.settings.cli.source.control.integration.cards.1f2b347bd3',
            'Merge requests, issues, todos, and pipelines via the'
          ),
          translate(
            'auto.components.settings.cli.source.control.integration.cards.2a6b359e75',
            'glab'
          )
        ),
        unavailable: translate(
          'auto.components.settings.cli.source.control.integration.cards.faddeb763d',
          'GitLab CLI status is not available in this runtime yet.'
        ),
        notInstalled: translate(
          'auto.components.settings.cli.source.control.integration.cards.b56fd5676a',
          'Install the GitLab CLI to enable merge requests, issues, and pipelines.'
        ),
        installLabel: translate(
          'auto.components.settings.cli.source.control.integration.cards.54a640af7a',
          'Install GitLab CLI'
        ),
        installDocsUrl: 'https://gitlab.com/gitlab-org/cli#installation',
        notAuthenticated: translate(
          'auto.components.settings.cli.source.control.integration.cards.glabSignInNeeded',
          'The GitLab CLI is installed but not signed in. You can also run this in any terminal:'
        ),
        authDocsUrl: 'https://gitlab.com/gitlab-org/cli/-/blob/main/docs/source/auth/login.md'
      }}
    />
  )
}
