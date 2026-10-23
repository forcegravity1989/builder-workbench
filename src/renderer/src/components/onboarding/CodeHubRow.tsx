import { useState } from 'react'
import { Loader2, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { IntegrationStatusPill } from '@/components/integration-status-pill'
import { OnboardingInlineCommandTerminal } from './OnboardingInlineCommandTerminal'
import { translate } from '@/i18n/i18n'
import { useCliInstall } from '@/components/settings/cli-install-action'
import { useIsLocalCliScope } from '@/components/settings/use-local-cli-scope'
import { formatBwCliInstallCommandLines } from '../../../../shared/bw-cli-install-commands'

// Why (BW): the Workbench wizard pitches CodeHub as the primary task source.
// The row reuses the real capability chain from the Settings connectors cards
// (#323): preflight `codehub-cli auth status` readback, app-run npm install,
// and card-embedded `codehub-cli auth login --all` — copy only mirrors the
// GitHubRow visual so the page reads as one family.
type CodeHubSetupState =
  | 'checking'
  | 'unavailable'
  | 'connected'
  | 'not-installed'
  | 'not-authenticated'

function getCodeHubSetupState(
  status: ReturnType<typeof useAppStore.getState>['preflightStatus'],
  loading: boolean
): CodeHubSetupState {
  if (loading || !status) {
    return 'checking'
  }
  // Why: the codehub readback postdates the gh one — payloads from older
  // remote agent hosts carry no codehub field at all.
  if (!status.codehub) {
    return 'unavailable'
  }
  if (!status.codehub.installed) {
    return 'not-installed'
  }
  return status.codehub.authenticated ? 'connected' : 'not-authenticated'
}

export function CodeHubRow(): React.JSX.Element {
  const preflightStatus = useAppStore((s) => s.preflightStatus)
  const preflightStatusLoading = useAppStore((s) => s.preflightStatusLoading)
  const refreshPreflightStatus = useAppStore((s) => s.refreshPreflightStatus)
  const { installing, startInstall } = useCliInstall('codehub')
  const isLocalScope = useIsLocalCliScope()

  const state = getCodeHubSetupState(preflightStatus, preflightStatusLoading)
  const [codehubTerminalOpen, setCodehubTerminalOpen] = useState(false)

  return (
    <div className="rounded-xl border border-border bg-muted/20">
      <div className="flex items-start gap-4 p-5">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground">
            <Terminal className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-semibold leading-tight text-foreground">
                {translate('auto.components.onboarding.IntegrationsStep.172af1b2c8', 'CodeHub')}
              </h3>
              {state === 'connected' ? (
                <IntegrationStatusPill tone="connected">
                  {translate('auto.components.onboarding.IntegrationsStep.c91a5782f1', 'Connected')}
                </IntegrationStatusPill>
              ) : state === 'not-installed' ? (
                <IntegrationStatusPill tone="attention">
                  {translate(
                    'auto.components.onboarding.IntegrationsStep.5c115cb713',
                    'CLI not installed'
                  )}
                </IntegrationStatusPill>
              ) : state === 'not-authenticated' ? (
                <IntegrationStatusPill tone="attention">
                  {translate(
                    'auto.components.onboarding.IntegrationsStep.8405043962',
                    'Sign in needed'
                  )}
                </IntegrationStatusPill>
              ) : (
                <IntegrationStatusPill tone="neutral">
                  {translate('auto.components.onboarding.IntegrationsStep.c1547656f0', 'Checking…')}
                </IntegrationStatusPill>
              )}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {translate(
                'auto.components.onboarding.IntegrationsStep.5b0e29617c',
                'Issues and merge requests.'
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {state === 'unavailable' ? (
            <span className="text-xs text-muted-foreground">
              {translate(
                'auto.components.onboarding.IntegrationsStep.110d12dbb6',
                'codehub-cli status is not available in this runtime yet.'
              )}
            </span>
          ) : null}
          {state === 'not-installed' && isLocalScope ? (
            <Button variant="outline" size="sm" disabled={installing} onClick={startInstall}>
              {installing ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : null}
              {translate(
                'auto.components.onboarding.IntegrationsStep.10e495afa8',
                'Install CodeHub CLI'
              )}
            </Button>
          ) : null}
          {state === 'not-authenticated' && isLocalScope ? (
            <Button
              variant="outline"
              size="sm"
              disabled={codehubTerminalOpen}
              onClick={() => setCodehubTerminalOpen(true)}
            >
              <Terminal className="size-3.5" />
              {codehubTerminalOpen
                ? translate('auto.components.onboarding.IntegrationsStep.0b4a7d23ab', 'Signing in')
                : translate('auto.components.onboarding.IntegrationsStep.d6e5dba05a', 'Sign in')}
            </Button>
          ) : null}
          {state !== 'connected' ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refreshPreflightStatus({ force: true })}
            >
              {translate('auto.components.onboarding.IntegrationsStep.80e3ce0bc9', 'Re-check')}
            </Button>
          ) : null}
        </div>
      </div>
      {state === 'not-installed' ? (
        <div className="px-5 pb-5">
          {/* Why: the displayed line is exactly what the app-run install
              executes (shared source of truth with the Settings cards). */}
          {formatBwCliInstallCommandLines('codehub').map((line) => (
            <p key={line} className="break-all font-mono text-[11px] text-muted-foreground">
              {line}
            </p>
          ))}
        </div>
      ) : null}
      {state === 'not-authenticated' && codehubTerminalOpen ? (
        <div className="px-5 pb-5">
          <OnboardingInlineCommandTerminal
            command="codehub-cli auth login --all"
            title={translate(
              'auto.components.onboarding.IntegrationsStep.98883abe0a',
              'CodeHub login'
            )}
            ariaLabel={translate(
              'auto.components.onboarding.IntegrationsStep.96d7cf755a',
              'CodeHub sign in command'
            )}
            description={translate(
              'auto.components.onboarding.IntegrationsStep.ed425b91ac',
              'Press Enter to run CodeHub CLI auth. Re-check CodeHub after the login flow finishes.'
            )}
          />
        </div>
      ) : null}
    </div>
  )
}
