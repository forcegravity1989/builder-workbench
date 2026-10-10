import { useState } from 'react'
import { translate } from '@/i18n/i18n'
import { getLocalPreflightContext } from '@/lib/local-preflight-context'
import { useAppStore } from '@/store'
import type { CliProviderCardState } from './source-control-preflight-card-status'

export function integrationStatusLabel(status: CliProviderCardState): string {
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

export const reCheckLabel = (): string =>
  translate('auto.components.settings.cli.source.control.integration.cards.d5b3be8ecd', 'Re-check')

/**
 * Setup terminals always run on this desktop. When the status comes from a
 * remote Orca server or a WSL distro, installing or signing in here would not
 * change what the card reports, so the cards keep only the command and docs.
 */
export function useSetupRunsWhereStatusIsChecked(): boolean {
  return useAppStore((s) => getLocalPreflightContext(s) === undefined)
}

/** One open setup step per card; null when no terminal is showing. */
export type SetupStep = { command: string; title: string } | null

export function useSetupStep(): {
  step: SetupStep
  open: (command: string, title: string) => void
  close: () => void
} {
  const [step, setStep] = useState<SetupStep>(null)
  return {
    step,
    open: (command, title) => setStep({ command, title }),
    close: () => setStep(null)
  }
}

export function cliDescription(lead: string, cli: string): React.ReactNode {
  return (
    <>
      {lead} <span className="font-mono text-[11px]">{cli}</span>{' '}
      {translate(
        'auto.components.settings.cli.source.control.integration.cards.a47f71e357',
        'CLI.'
      )}
    </>
  )
}
