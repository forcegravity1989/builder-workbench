import { CLASSIC_TERMINAL_THEMES } from '../../renderer/src/lib/terminal-themes/classic'
import { DEFAULT_TERMINAL_THEMES } from '../../renderer/src/lib/terminal-themes/defaults'
import { POPULAR_DARK_TERMINAL_THEMES } from '../../renderer/src/lib/terminal-themes/popular-dark'
import { POPULAR_LIGHT_TERMINAL_THEMES } from '../../renderer/src/lib/terminal-themes/popular-light'
import { mergeTerminalThemeCatalogs } from './terminal-theme-catalog-merge'
import type { TerminalThemeMap } from './types'

const THEME_CATEGORIES: readonly TerminalThemeMap[] = [
  DEFAULT_TERMINAL_THEMES,
  POPULAR_DARK_TERMINAL_THEMES,
  POPULAR_LIGHT_TERMINAL_THEMES,
  CLASSIC_TERMINAL_THEMES
]

export const TERMINAL_THEME_CATALOG: TerminalThemeMap = mergeTerminalThemeCatalogs(
  ...THEME_CATEGORIES
)
