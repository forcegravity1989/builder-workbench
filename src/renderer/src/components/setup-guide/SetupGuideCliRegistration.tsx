import { RefreshCw, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { SetupGuideCliStatus } from './use-setup-guide-cli-status'

export function SetupGuideCliRegistration({
  cli
}: {
  cli: SetupGuideCliStatus
}): React.JSX.Element {
  const statusLabel = cli.checking
    ? translate('guidance.cliChecking', 'Checking CLI status…')
    : cli.available
      ? translate('guidance.cliAvailable', 'Registered and available on PATH')
      : cli.status && cli.status.pathConfigured !== null
        ? translate('guidance.cliNeedsRegistration', 'Registration needs attention')
        : translate('guidance.cliUnknown', 'CLI status unknown')
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Terminal className="size-4" />
        <span>Orca CLI · {cli.runtimeLabel}</span>
      </div>
      <p className="text-xs text-muted-foreground" role="status">
        {statusLabel}
      </p>
      {cli.unavailableReason || cli.error || cli.status?.detail ? (
        <p className="text-xs text-muted-foreground">
          {cli.unavailableReason ?? cli.error ?? cli.status?.detail}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={cli.checking || !!cli.unavailableReason}
          onClick={() => void cli.refresh()}
        >
          <RefreshCw className="size-3.5" />
          {translate('guidance.cliRecheck', 'Check again')}
        </Button>
        {!cli.available ? (
          <Button
            type="button"
            size="sm"
            disabled={
              cli.checking ||
              !!cli.unavailableReason ||
              !cli.status?.supported ||
              cli.status.pathConfigured === null
            }
            onClick={() => void cli.register()}
          >
            {cli.registering
              ? translate('guidance.cliRegistering', 'Registering…')
              : translate('guidance.cliRegister', 'Register CLI')}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {translate(
          'guidance.cliOptional',
          'You can skip this step and continue working. Register the CLI when you need agent capabilities.'
        )}
      </p>
    </div>
  )
}
