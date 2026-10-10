import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { OnboardingInlineCommandTerminal } from '@/components/onboarding/OnboardingInlineCommandTerminal'
import { translate } from '@/i18n/i18n'

export type SetupTerminalShell = { family: 'posix' | 'powershell'; shellOverride?: string }

/**
 * Setup commands are written for PowerShell on Windows and the login shell
 * elsewhere. Why pin PowerShell: a Windows user whose default terminal is Git
 * Bash or WSL would otherwise get winget / quoting that their shell rejects.
 */
export function useSetupTerminalShell(): SetupTerminalShell {
  return useMemo(
    () =>
      window.api.platform.get().platform === 'win32'
        ? { family: 'powershell', shellOverride: 'powershell.exe' }
        : { family: 'posix' },
    []
  )
}

/**
 * Inline terminal for one setup step. The command is pasted, not executed:
 * the user presses Enter, so installs and sign-ins never run without them.
 * Every finished command (and the shell exiting) triggers `onCheck`, because
 * re-reading real status is the only proof the step worked.
 */
export function IntegrationSetupTerminal(props: {
  id: string
  command: string
  title: string
  onCheck: () => void
  onClose: () => void
}): React.JSX.Element {
  const shell = useSetupTerminalShell()
  return (
    <div className="space-y-2">
      <OnboardingInlineCommandTerminal
        key={props.command}
        worktreeId={`integration-setup-${props.id}`}
        command={props.command}
        title={props.title}
        description={translate(
          'auto.components.settings.IntegrationSetupTerminal.description',
          'The command is filled in. Press Enter to run it; sign-ins open your browser and finish when you approve.'
        )}
        ariaLabel={props.title}
        terminalHeightPx={220}
        shellOverride={shell.shellOverride}
        forceHostRuntime
        onCommandFinished={props.onCheck}
        onTerminalExit={() => {
          props.onCheck()
          props.onClose()
        }}
      />
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            props.onCheck()
            props.onClose()
          }}
        >
          {translate('auto.components.settings.IntegrationSetupTerminal.done', 'Done')}
        </Button>
      </div>
    </div>
  )
}
