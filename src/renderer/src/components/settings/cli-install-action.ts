import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { BwCliInstallId } from '../../../../shared/bw-cli-install-commands'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'

// Why (BW #323): install is an app-run background command (user decision
// 2026-10-16) — the card keeps showing "Installing…" for the whole run and
// the finish broadcast drives the completion / failure notification. The
// run itself is owned by the main process, so the card resyncs on mount to
// survive navigate-away-and-back.

const INSTALL_TOAST_DEFAULTS: Record<BwCliInstallId, { succeeded: string; failed: string }> = {
  codehub: {
    succeeded: 'CodeHub CLI installed. Re-checking its status…',
    failed: 'CodeHub CLI install failed.'
  },
  welink: {
    succeeded: 'WeLink CLI installed. Re-checking its status…',
    failed: 'WeLink CLI install failed.'
  },
  cloudbuild: {
    succeeded: 'CloudBuild CLI installed. Re-checking its status…',
    failed: 'CloudBuild CLI install failed.'
  }
}

export function useCliInstall(cli: BwCliInstallId): {
  installing: boolean
  startInstall: () => void
} {
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    void window.api.cliInstall.isRunning({ cli }).then(setInstalling)
    return window.api.cliInstall.onFinished((payload) => {
      if (payload.cli !== cli) {
        return
      }
      setInstalling(false)
      const defaults = INSTALL_TOAST_DEFAULTS[cli]
      if (payload.ok) {
        toast.success(
          translate(
            `auto.components.settings.cli.source.control.integration.cards.${cli}InstallSucceeded`,
            defaults.succeeded
          )
        )
        // Why (BW #323): the app ran the install, so it knows when it ends —
        // re-check automatically (user decision 2026-10-16). Terminal-injected
        // logins still rely on the manual Re-check because the app cannot see
        // a terminal command's exit.
        void useAppStore.getState().refreshPreflightStatus({ force: true })
      } else {
        toast.error(
          translate(
            `auto.components.settings.cli.source.control.integration.cards.${cli}InstallFailed`,
            defaults.failed
          ),
          {
            description: `${payload.reason}${payload.tail ? `\n${payload.tail}` : ''}`
          }
        )
      }
    })
  }, [cli])

  const startInstall = useCallback((): void => {
    void window.api.cliInstall.start({ cli }).then((result) => {
      setInstalling(result.started)
    })
  }, [cli])

  return { installing, startInstall }
}
