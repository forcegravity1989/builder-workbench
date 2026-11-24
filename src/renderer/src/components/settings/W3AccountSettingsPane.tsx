import { useState } from 'react'
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Check,
  CircleUserRound,
  Globe,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import type { W3OpenWebResult } from '../../../../shared/w3-account'
import { toW3AccountView, type W3AccountView } from './w3-account-view-model'
import { useW3AccountStatus } from './use-w3-account-status'

function failureMessage(reason: Extract<W3AccountView, { kind: 'failed' }>['reason']): string {
  switch (reason) {
    case 'not-configured':
      return translate(
        'auto.components.settings.w3Account.failedNotConfigured',
        'Sign-in is not configured yet. Contact your administrator.'
      )
    case 'login-failed':
      return translate(
        'auto.components.settings.w3Account.failedLogin',
        'The W3 session did not complete login. Try again.'
      )
    case 'account-parse-failed':
      return translate(
        'auto.components.settings.w3Account.failedAccountParse',
        'W3 reported a login, but no valid profile could be read. Try again.'
      )
    case 'timeout':
      return translate(
        'auto.components.settings.w3Account.failedTimeout',
        'Sign-in timed out. Try again.'
      )
    case 'cancelled':
      return translate(
        'auto.components.settings.w3Account.failedCancelled',
        'Sign-in was cancelled.'
      )
    case 'open-failed':
      return translate(
        'auto.components.settings.w3Account.failedOpen',
        'Could not open the W3 login window.'
      )
    case 'sync-failed':
      return translate(
        'auto.components.settings.w3Account.failedSync',
        'Could not reuse the sign-in from the system browser. Retry, or sign in manually below.'
      )
  }
}

function CardShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="rounded-xl border border-border bg-card p-6 shadow-xs">{children}</div>
}

function WelcomeCard({
  onSync,
  onStart
}: {
  onSync: () => void
  onStart: () => void
}): React.JSX.Element {
  return (
    <div className="mx-auto w-full max-w-[520px]">
      <CardShell>
        <div className="flex flex-col items-center text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="size-7" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">
            {translate('auto.components.settings.w3Account.welcomeHeading', 'Welcome back')}
          </h3>
          <p className="mt-2 max-w-[380px] text-sm leading-6 text-muted-foreground">
            {translate(
              'auto.components.settings.w3Account.welcomeBody',
              'Use your W3 account to sign in. Internal sites in the built-in browser will reuse this sign-in.'
            )}
          </p>
          <Button type="button" size="lg" className="mt-6 min-w-[240px]" onClick={onSync}>
            <RefreshCw className="size-4" />
            {translate(
              'auto.components.settings.w3Account.syncButton',
              'Reuse sign-in from system browser'
            )}
          </Button>
          <div className="mt-2">
            <Button type="button" variant="ghost" size="sm" onClick={onStart}>
              <LogIn className="size-4" />
              {translate(
                'auto.components.settings.w3Account.signInButton',
                'Sign in with Huawei W3'
              )}
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.w3Account.welcomeFineprint',
              'No password needed. Whether it is passwordless depends on your W3 session and company policy.'
            )}
          </p>
        </div>
      </CardShell>
    </div>
  )
}

function SyncPendingCard({ onCancel }: { onCancel: () => void }): React.JSX.Element {
  return (
    <div className="mx-auto w-full max-w-[520px]">
      <CardShell>
        <div className="flex flex-col items-center text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <Loader2 className="size-7 animate-spin" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">
            {translate(
              'auto.components.settings.w3Account.syncPendingHeading',
              'Reusing sign-in from system browser…'
            )}
          </h3>
          <p className="mt-2 max-w-[380px] text-sm leading-6 text-muted-foreground">
            {translate(
              'auto.components.settings.w3Account.syncPendingBody',
              'A temporary system browser session completes the passwordless sign-in for you. No action needed.'
            )}
          </p>
          <Button type="button" size="lg" className="mt-6 min-w-[240px]" disabled>
            <Loader2 className="size-4 animate-spin" />
            {translate('auto.components.settings.w3Account.syncPendingButton', 'Syncing…')}
          </Button>
          <div className="mt-2">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              {translate('auto.components.settings.w3Account.syncPendingCancel', 'Cancel sync')}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.w3Account.syncPendingFineprint',
              'Sign-in completes when the W3 account API confirms a valid identity; this page updates automatically.'
            )}
          </p>
        </div>
      </CardShell>
    </div>
  )
}

function LoginPendingCard({ onCancel }: { onCancel: () => void }): React.JSX.Element {
  return (
    <div className="mx-auto w-full max-w-[520px]">
      <CardShell>
        <div className="flex flex-col items-center text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <Loader2 className="size-7 animate-spin" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">
            {translate(
              'auto.components.settings.w3Account.loginPendingHeading',
              'W3 login window opened'
            )}
          </h3>
          <p className="mt-2 max-w-[380px] text-sm leading-6 text-muted-foreground">
            {translate(
              'auto.components.settings.w3Account.loginPendingBody',
              'Complete sign-in in the Orca W3 login window. Opening the window does not mean you are signed in.'
            )}
          </p>
          <Button type="button" size="lg" className="mt-6 min-w-[240px]" disabled>
            <Loader2 className="size-4 animate-spin" />
            {translate(
              'auto.components.settings.w3Account.loginPendingButton',
              'Waiting for W3 sign-in…'
            )}
          </Button>
          <div className="mt-2">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              {translate('auto.components.settings.w3Account.loginPendingCancel', 'Cancel sign-in')}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.w3Account.loginPendingFineprint',
              'Sign-in completes when the W3 account API confirms a valid identity; this page updates automatically.'
            )}
          </p>
        </div>
      </CardShell>
    </div>
  )
}

function SignedInCard({
  hasIdentity,
  displayName,
  employeeNo,
  onSignOut,
  onOpenWeb
}: {
  hasIdentity: boolean
  displayName: string
  employeeNo: string
  onSignOut: () => void
  onOpenWeb: () => Promise<W3OpenWebResult>
}): React.JSX.Element {
  const noProfile = translate(
    'auto.components.settings.w3Account.signedInNoProfile',
    'Signed in (no profile info)'
  )
  const [error, setError] = useState<string | null>(null)
  const [opened, setOpened] = useState(false)
  const [opening, setOpening] = useState(false)

  const openShortcut = async (): Promise<void> => {
    if (opening) {
      return
    }
    setOpening(true)
    setError(null)
    setOpened(false)
    try {
      const result = await onOpenWeb()
      if (result.ok) {
        setOpened(true)
      } else if (result.reason === 'not-signed-in') {
        setError(
          translate('auto.components.settings.w3Account.openWebNotSignedIn', 'Sign in to W3 first.')
        )
      } else {
        setError(
          translate(
            'auto.components.settings.w3Account.openWebFailed',
            'Could not open the W3 window.'
          )
        )
      }
    } catch {
      setError(
        translate(
          'auto.components.settings.w3Account.openWebFailed',
          'Could not open the W3 window.'
        )
      )
    } finally {
      setOpening(false)
    }
  }

  const name = hasIdentity ? displayName || noProfile : noProfile

  return (
    <div className="mx-auto w-full max-w-[520px] space-y-3">
      {/* Identity card */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="grid size-14 place-items-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-lg font-semibold text-primary-foreground shadow-sm">
              {hasIdentity ? displayName.charAt(0) || '✓' : <Check className="size-5" />}
            </div>
            <span className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-card bg-status-success" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-[15px] font-semibold">{name}</p>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-status-success-border bg-status-success-background px-2 py-0.5 text-[11px] font-medium text-status-success">
                <Check className="size-3" />
                {translate('auto.components.settings.w3Account.signedInBadge', 'Signed in')}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {hasIdentity && employeeNo
                ? `${translate('auto.components.settings.w3Account.employeeNoLabel', 'Employee No.')} ${employeeNo}`
                : translate(
                    'auto.components.settings.w3Account.signedInNoProfileDetail',
                    'W3 sign-in succeeded, but no profile info could be read.'
                  )}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={onSignOut}>
            <LogOut className="size-4" />
            {translate('auto.components.settings.w3Account.signOut', 'Sign out')}
          </Button>
        </div>
      </div>

      {/* Shortcut card */}
      <button
        type="button"
        onClick={() => void openShortcut()}
        disabled={opening}
        className="group flex w-full items-center gap-3.5 rounded-xl border border-border bg-card p-4 text-left shadow-xs transition-colors hover:border-primary/30 hover:bg-accent/60 disabled:opacity-70"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          {opening ? <Loader2 className="size-5 animate-spin" /> : <Globe className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {translate('auto.components.settings.w3Account.openW3Home', 'Open W3 home')}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.w3Account.openW3HomeDescription',
              'w3.huawei.com · Opens in the built-in browser with this W3 session'
            )}
          </p>
        </div>
        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
      </button>

      {error ? (
        <div
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      ) : null}
      {opened ? (
        <div className="flex items-center gap-2 rounded-lg border border-status-success-border bg-status-success-background px-3 py-2 text-xs text-status-success">
          <CheckCircle2 className="size-4 shrink-0" />
          {translate('auto.components.settings.w3Account.openWebOpened', 'W3 window opened.')}
        </div>
      ) : null}
    </div>
  )
}

function FailedCard({
  reason,
  onRetry,
  onStartManual
}: {
  reason: Extract<W3AccountView, { kind: 'failed' }>['reason']
  onRetry: () => void
  onStartManual: () => void
}): React.JSX.Element {
  return (
    <div className="mx-auto w-full max-w-[520px]">
      <CardShell>
        <div className="flex flex-col items-center text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertCircle className="size-7" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">
            {translate('auto.components.settings.w3Account.failedHeading', 'Sign-in not completed')}
          </h3>
          <div className="mt-3 w-full rounded-lg border border-border bg-muted/40 p-3 text-left text-xs leading-5 text-muted-foreground">
            {failureMessage(reason)}
          </div>
          <Button type="button" size="lg" className="mt-5 min-w-[240px]" onClick={onRetry}>
            <RefreshCw className="size-4" />
            {translate('auto.components.settings.w3Account.retry', 'Retry')}
          </Button>
          <div className="mt-2">
            <Button type="button" variant="ghost" size="sm" onClick={onStartManual}>
              <LogIn className="size-4" />
              {translate(
                'auto.components.settings.w3Account.signInButton',
                'Sign in with Huawei W3'
              )}
            </Button>
          </div>
        </div>
      </CardShell>
    </div>
  )
}

function UnconfiguredCard(): React.JSX.Element {
  return (
    <div className="mx-auto w-full max-w-[520px]">
      <CardShell>
        <div className="flex flex-col items-center text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <CircleUserRound className="size-7" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">
            {translate('auto.components.settings.w3Account.failedHeading', 'Sign-in not completed')}
          </h3>
          <p className="mt-2 max-w-[380px] text-sm leading-6 text-muted-foreground">
            {translate(
              'auto.components.settings.w3Account.failedNotConfigured',
              'Sign-in is not configured yet. Contact your administrator.'
            )}
          </p>
        </div>
      </CardShell>
    </div>
  )
}

export function W3AccountSettingsPane(): React.JSX.Element {
  const { status, start, sync, cancel, signOut, openWeb } = useW3AccountStatus()
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const view = toW3AccountView(status)

  const confirmSignOut = async (): Promise<void> => {
    if (signingOut) {
      return
    }
    setSigningOut(true)
    await signOut()
    setSigningOut(false)
    setSignOutOpen(false)
  }

  return (
    <>
      <div className="mx-auto w-full max-w-[560px] py-4">
        {view.kind === 'loading' ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {translate('auto.components.settings.w3Account.checking', 'Checking account status…')}
          </p>
        ) : null}
        {view.kind === 'unconfigured' ? <UnconfiguredCard /> : null}
        {view.kind === 'signed-out' ? (
          <WelcomeCard onSync={() => void sync()} onStart={() => void start()} />
        ) : null}
        {view.kind === 'login-pending' ? <LoginPendingCard onCancel={() => void cancel()} /> : null}
        {view.kind === 'sync-pending' ? <SyncPendingCard onCancel={() => void cancel()} /> : null}
        {view.kind === 'signed-in' ? (
          <SignedInCard
            hasIdentity={view.hasIdentity}
            displayName={view.displayName}
            employeeNo={view.employeeNo}
            onSignOut={() => setSignOutOpen(true)}
            onOpenWeb={openWeb}
          />
        ) : null}
        {view.kind === 'failed' ? (
          <FailedCard
            reason={view.reason}
            onRetry={() => void sync()}
            onStartManual={() => void start()}
          />
        ) : null}
      </div>

      <Dialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>
              {translate(
                'auto.components.settings.w3Account.signOutConfirmTitle',
                'Sign out of W3 Account?'
              )}
            </DialogTitle>
            <DialogDescription>
              {translate(
                'auto.components.settings.w3Account.signOutConfirmBody',
                'This signs you out of the W3 session used by the built-in browser. Internal sites may require signing in again.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSignOutOpen(false)}
              disabled={signingOut}
            >
              {translate('auto.components.settings.w3Account.cancel', 'Cancel')}
            </Button>
            <Button size="sm" onClick={() => void confirmSignOut()} disabled={signingOut}>
              {signingOut ? <Loader2 className="size-4 animate-spin" /> : null}
              {translate('auto.components.settings.w3Account.signOut', 'Sign out')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
