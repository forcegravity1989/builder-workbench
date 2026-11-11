import { useEffect, useState } from 'react'
import { Loader2, MessageSquare, Terminal, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useMountedRef } from '@/hooks/useMountedRef'
import { useAppStore } from '../../store'
import type { WelinkReportConfigState } from '../../../../shared/workbench/welink-report-config'
import { IntegrationCardShell } from './integration-card-shell'
import { useIntegrationCommandRowClass } from './integration-card-presentation'
import { usePreflightCardStatuses } from './source-control-preflight-card-status'
import { translate } from '@/i18n/i18n'
import { OnboardingInlineCommandTerminal } from '../onboarding/OnboardingInlineCommandTerminal'
import { useIsLocalCliScope } from './use-local-cli-scope'
import { useCliInstall } from './cli-install-action'
import {
  formatBwCliInstallCommandLines,
  type BwCliInstallId
} from '../../../../shared/bw-cli-install-commands'
import {
  integrationStatusLabel,
  ProviderAccountScopeDetails
} from './cli-source-control-integration-cards'

// Why (BW #323 / #366): CodeHub, WeLink and CloudBuild are BW-only CLIs, so
// their cards live in a BW file instead of growing the upstream card module
// past its line budget; the barrel re-exports them next to the upstream
// cards. The three cards share one install / login / re-check skeleton — the
// per-CLI differences are copy, probe ids and the login command only, so each
// card is a thin config wrapper over BwCliIntegrationCard below.

// Why: copy fields are thunks around literal translate() calls — i18next-cli's
// extractor only sees literal call sites, so plain key strings in the config
// would drop the keys out of the extraction catalog check.
type BwCliCardConfig = {
  provider: 'codehub' | 'welink' | 'cloudbuild'
  statusField: 'codehubStatus' | 'welinkStatus' | 'cloudbuildStatus'
  installId: BwCliInstallId
  name: string
  icon: React.ReactNode
  descriptionLead: () => string
  cliName: string
  unavailableCopy: () => string
  missingCopy: () => string
  installButtonCopy: () => string
  notAuthenticatedCopy: () => string
  loginCommand: string
  loginCommandCopy: () => string
  loginTitle: () => string
  loginAriaLabel: () => string
  worktreeId: string
}

const reCheckCopy = () =>
  translate('auto.components.settings.cli.source.control.integration.cards.d5b3be8ecd', 'Re-check')

function BwCliIntegrationCard(config: BwCliCardConfig): React.JSX.Element {
  const { statuses, unavailable, refresh } = usePreflightCardStatuses(config.provider)
  const status = unavailable ? 'unavailable' : statuses[config.statusField]
  const connected = status === 'connected'
  const commandRowClass = useIntegrationCommandRowClass()
  const isLocalScope = useIsLocalCliScope()
  const { installing, startInstall } = useCliInstall(config.installId)
  // Why (BW #323): login runs in the card-embedded inline terminal (user
  // decision 2026-10-19 — reverses the floating-terminal injection; the
  // upstream OnboardingInlineCommandTerminal pastes the command and the
  // human presses Enter, per the issue's original form).
  const [loginTerminalOpen, setLoginTerminalOpen] = useState(false)
  // Why: clicking Log in again must start a fresh session (new tab + fresh
  // injection). The key change remounts the inline terminal; a plain boolean
  // toggle would no-op while the terminal is already open.
  const [loginAttempt, setLoginAttempt] = useState(0)

  return (
    <IntegrationCardShell
      icon={config.icon}
      name={config.name}
      description={
        <>
          {config.descriptionLead()} <span className="font-mono text-[11px]">{config.cliName}</span>{' '}
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
              <p className="text-xs text-muted-foreground">{config.unavailableCopy()}</p>
              <Button variant="ghost" size="sm" onClick={refresh}>
                {reCheckCopy()}
              </Button>
            </>
          ) : status === 'not-installed' ? (
            <>
              <p className="text-xs text-muted-foreground">{config.missingCopy()}</p>
              {/* Why: the command rows render the shared install module
                  directly — the displayed lines are exactly what the runner
                  executes (cloudbuild's口径 is a two-step sequence). */}
              {formatBwCliInstallCommandLines(config.installId).map((line) => (
                <div className={commandRowClass} key={line}>
                  <Terminal className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="break-all">{line}</span>
                </div>
              ))}
              {installing ? (
                <p className="text-xs text-muted-foreground">
                  {translate(
                    'auto.components.settings.cli.source.control.integration.cards.installInProgressNote',
                    'Installing in the background. You will be notified here when it finishes.'
                  )}
                </p>
              ) : null}
              <div className="flex items-center gap-2">
                {isLocalScope ? (
                  <Button variant="outline" size="sm" disabled={installing} onClick={startInstall}>
                    {installing ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : null}
                    {installing
                      ? translate(
                          'auto.components.settings.cli.source.control.integration.cards.installingButton',
                          'Installing…'
                        )
                      : config.installButtonCopy()}
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={refresh}>
                  {reCheckCopy()}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{config.notAuthenticatedCopy()}</p>
              <div className={commandRowClass}>
                <Terminal className="size-3.5 shrink-0 text-muted-foreground" />
                {config.loginCommandCopy()}
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
                <Button variant="ghost" size="sm" onClick={refresh}>
                  {reCheckCopy()}
                </Button>
              </div>
            </>
          )
        ) : connected ? (
          // Why (BW #323): spec — connected cards keep only Re-check (I10
          // re-verification); the upstream pattern rendered no action at all.
          <Button variant="ghost" size="sm" onClick={refresh}>
            {reCheckCopy()}
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
            command={config.loginCommand}
            title={config.loginTitle()}
            description={translate(
              'auto.components.settings.cli.source.control.integration.cards.pressEnterDescription',
              'Press Enter to run the command.'
            )}
            ariaLabel={config.loginAriaLabel()}
            worktreeId={config.worktreeId}
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

export function CodeHubIntegrationCard(): React.JSX.Element {
  return (
    <BwCliIntegrationCard
      provider="codehub"
      statusField="codehubStatus"
      installId="codehub"
      name="CodeHub"
      icon={<Terminal className="size-5" />}
      cliName="codehub-cli"
      descriptionLead={() =>
        translate(
          'auto.components.settings.cli.source.control.integration.cards.codehubDescription',
          'Issues and merge requests via the'
        )
      }
      unavailableCopy={() =>
        translate(
          'auto.components.settings.cli.source.control.integration.cards.codehubUnavailable',
          'codehub-cli status is not available in this runtime yet.'
        )
      }
      missingCopy={() =>
        translate(
          'auto.components.settings.cli.source.control.integration.cards.codehubMissing',
          'codehub-cli is not on PATH.'
        )
      }
      installButtonCopy={() =>
        translate(
          'auto.components.settings.cli.source.control.integration.cards.codehubInstallButton',
          'Install CodeHub CLI'
        )
      }
      notAuthenticatedCopy={() =>
        translate(
          'auto.components.settings.cli.source.control.integration.cards.codehubNotAuthenticated',
          'codehub-cli is installed but not authenticated.'
        )
      }
      loginCommand="codehub-cli auth login --all"
      loginCommandCopy={() =>
        translate(
          'auto.components.settings.cli.source.control.integration.cards.codehubAuthLoginCommand',
          'codehub-cli auth login --all'
        )
      }
      loginTitle={() =>
        translate(
          'auto.components.settings.cli.source.control.integration.cards.codehubLoginTitle',
          'CodeHub login'
        )
      }
      loginAriaLabel={() =>
        translate(
          'auto.components.settings.cli.source.control.integration.cards.codehubLoginTerminalAriaLabel',
          'CodeHub login terminal'
        )
      }
      worktreeId="connectors-codehub-login"
    />
  )
}

export function WeLinkIntegrationCard(): React.JSX.Element {
  return (
    <BwCliIntegrationCard
      provider="welink"
      statusField="welinkStatus"
      installId="welink"
      name="WeLink"
      icon={<MessageSquare className="size-5" />}
      cliName="welink-cli"
      descriptionLead={() =>
        translate(
          'auto.components.settings.cli.source.control.integration.cards.welinkDescription',
          'Project group notifications via the'
        )
      }
      unavailableCopy={() =>
        translate(
          'auto.components.settings.cli.source.control.integration.cards.welinkUnavailable',
          'welink-cli status is not available in this runtime yet.'
        )
      }
      missingCopy={() =>
        translate(
          'auto.components.settings.cli.source.control.integration.cards.welinkMissing',
          'Install welink-cli to enable project group notifications.'
        )
      }
      installButtonCopy={() =>
        translate(
          'auto.components.settings.cli.source.control.integration.cards.welinkInstallButton',
          'Install WeLink CLI'
        )
      }
      notAuthenticatedCopy={() =>
        translate(
          'auto.components.settings.cli.source.control.integration.cards.welinkNotAuthenticated',
          'welink-cli is installed but not authenticated.'
        )
      }
      loginCommand="welink-cli auth login"
      loginCommandCopy={() =>
        translate(
          'auto.components.settings.cli.source.control.integration.cards.welinkAuthLoginCommand',
          'welink-cli auth login'
        )
      }
      loginTitle={() =>
        translate(
          'auto.components.settings.cli.source.control.integration.cards.welinkLoginTitle',
          'WeLink login'
        )
      }
      loginAriaLabel={() =>
        translate(
          'auto.components.settings.cli.source.control.integration.cards.welinkLoginTerminalAriaLabel',
          'WeLink login terminal'
        )
      }
      worktreeId="connectors-welink-login"
    />
  )
}

// Why (BW #366): cloudbuild's cb backs the CodeHub package-build execution
// face; the card gives it the same install / login / re-check lifecycle as
// the other BW CLIs.
export function CloudBuildIntegrationCard(): React.JSX.Element {
  return (
    <BwCliIntegrationCard
      provider="cloudbuild"
      statusField="cloudbuildStatus"
      installId="cloudbuild"
      name="CloudBuild"
      icon={<Workflow className="size-5" />}
      cliName="cb"
      descriptionLead={() =>
        translate(
          'auto.components.settings.cli.source.control.integration.cards.cloudbuildDescription',
          'Pipelines and package builds via the'
        )
      }
      unavailableCopy={() =>
        translate(
          'auto.components.settings.cli.source.control.integration.cards.cloudbuildUnavailable',
          'cb status is not available in this runtime yet.'
        )
      }
      missingCopy={() =>
        translate(
          'auto.components.settings.cli.source.control.integration.cards.cloudbuildMissing',
          'cb is not on PATH.'
        )
      }
      installButtonCopy={() =>
        translate(
          'auto.components.settings.cli.source.control.integration.cards.cloudbuildInstallButton',
          'Install CloudBuild CLI'
        )
      }
      notAuthenticatedCopy={() =>
        translate(
          'auto.components.settings.cli.source.control.integration.cards.cloudbuildNotAuthenticated',
          'cb is installed but not authenticated.'
        )
      }
      loginCommand="cb login"
      loginCommandCopy={() =>
        translate(
          'auto.components.settings.cli.source.control.integration.cards.cloudbuildAuthLoginCommand',
          'cb login'
        )
      }
      loginTitle={() =>
        translate(
          'auto.components.settings.cli.source.control.integration.cards.cloudbuildLoginTitle',
          'CloudBuild login'
        )
      }
      loginAriaLabel={() =>
        translate(
          'auto.components.settings.cli.source.control.integration.cards.cloudbuildLoginTerminalAriaLabel',
          'CloudBuild login terminal'
        )
      }
      worktreeId="connectors-cloudbuild-login"
    />
  )
}

// BW #553: the group-space id moved from build-time-only config to a settings
// input (human decision 2026-11-11). A build define pins the value and turns
// the input read-only — the planned "fixed default, not modifiable" mode.
export function WeLinkReportSpaceIdSettings(): React.JSX.Element | null {
  const [state, setState] = useState<WelinkReportConfigState | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useMountedRef()

  useEffect(() => {
    let stale = false
    void window.api.welinkReportConfig.getState().then((next) => {
      if (!stale) {
        setState(next)
        setDraft(next.settingsSpaceId ?? '')
      }
    })
    return () => {
      stale = true
    }
  }, [])

  if (!state) {
    return null
  }
  const locked = state.locked
  const dirty = draft.trim() !== (state.settingsSpaceId ?? '')

  const save = async (): Promise<void> => {
    const value = draft.trim()
    if (value && !/^\d{1,20}$/.test(value)) {
      setError(
        translate(
          'auto.components.settings.cli.source.control.integration.cards.welinkSpaceIdInvalid',
          'The group space ID must be digits only.'
        )
      )
      return
    }
    setSaving(true)
    setError(null)
    try {
      await useAppStore.getState().updateSettingsOrThrow({
        workbenchWelinkSpaceId: value.length > 0 ? value : null
      })
      if (mountedRef.current) {
        setState({ ...state, settingsSpaceId: value.length > 0 ? value : null })
      }
    } catch (reason) {
      if (mountedRef.current) {
        setError(reason instanceof Error ? reason.message : String(reason))
      }
    } finally {
      if (mountedRef.current) {
        setSaving(false)
      }
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-card/40 p-3">
      <Label className="text-xs">
        {translate(
          'auto.components.settings.cli.source.control.integration.cards.welinkSpaceIdLabel',
          'WeLink group space ID (report destination)'
        )}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          value={locked ? (state.lockedSpaceId ?? '') : draft}
          disabled={locked || saving}
          inputMode="numeric"
          onChange={(event) => setDraft(event.target.value)}
          placeholder="e.g. 109379610574"
          className="h-8 max-w-56 text-xs"
        />
        {locked ? null : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {translate(
              'auto.components.settings.cli.source.control.integration.cards.welinkSpaceIdSave',
              'Save'
            )}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {locked
          ? translate(
              'auto.components.settings.cli.source.control.integration.cards.welinkSpaceIdLocked',
              'This build pins the report group space; the value is read-only.'
            )
          : translate(
              'auto.components.settings.cli.source.control.integration.cards.welinkSpaceIdHint',
              'Feedback, crash reports and diagnostic bundles upload to the「Workbench 上报」folder of this group space. Empty means not configured — sends then stop with setup guidance.'
            )}
      </p>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
