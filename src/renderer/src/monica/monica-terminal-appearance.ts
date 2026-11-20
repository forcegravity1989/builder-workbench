import type { ITheme } from '@xterm/xterm'

const MONICA_TERMINAL_BACKGROUND = '#fefdfa'
const MONICA_TERMINAL_BACKGROUND_DARK = '#171717'

/** Keep in sync with `--color-card` in monica-tokens.css (light and dark blocks). */
export function monicaTerminalBackground(mode: 'dark' | 'light'): string {
  return mode === 'dark' ? MONICA_TERMINAL_BACKGROUND_DARK : MONICA_TERMINAL_BACKGROUND
}

export function applyMonicaTerminalSurface(theme: ITheme, mode: 'dark' | 'light'): ITheme {
  return mode === 'dark'
    ? {
        ...theme,
        background: MONICA_TERMINAL_BACKGROUND_DARK,
        selectionBackground: '#3d3a36'
      }
    : {
        ...theme,
        background: MONICA_TERMINAL_BACKGROUND,
        selectionBackground: '#fef0eb'
      }
}
