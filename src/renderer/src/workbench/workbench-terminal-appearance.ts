import type { ITheme } from '@xterm/xterm'

/** Keep in sync with `--color-card` in workbench-tokens.css. */
export const WORKBENCH_TERMINAL_BACKGROUND = '#fefdfa'

export function applyWorkbenchTerminalSurface(theme: ITheme): ITheme {
  return {
    ...theme,
    background: WORKBENCH_TERMINAL_BACKGROUND,
    selectionBackground: '#fef0eb'
  }
}
