import type { ITheme } from '@xterm/xterm'

const WORKBENCH_TERMINAL_BACKGROUND = '#fefdfa'
const WORKBENCH_TERMINAL_BACKGROUND_DARK = '#171717'

/** Keep in sync with `--color-card` in workbench-tokens.css (light and dark blocks). */
export function workbenchTerminalBackground(mode: 'dark' | 'light'): string {
  return mode === 'dark' ? WORKBENCH_TERMINAL_BACKGROUND_DARK : WORKBENCH_TERMINAL_BACKGROUND
}

export function applyWorkbenchTerminalSurface(theme: ITheme, mode: 'dark' | 'light'): ITheme {
  return mode === 'dark'
    ? {
        ...theme,
        background: WORKBENCH_TERMINAL_BACKGROUND_DARK,
        selectionBackground: '#3d3a36'
      }
    : {
        ...theme,
        background: WORKBENCH_TERMINAL_BACKGROUND,
        selectionBackground: '#fef0eb'
      }
}
