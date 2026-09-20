import { describe, expect, it } from 'vitest'
import {
  applyWorkbenchTerminalSurface,
  WORKBENCH_TERMINAL_BACKGROUND
} from './workbench-terminal-appearance'

describe('workbench terminal surface', () => {
  it('replaces the xterm canvas with the workbench card color', () => {
    expect(
      applyWorkbenchTerminalSurface({
        background: '#ffffff',
        foreground: '#111111',
        cursor: '#111111'
      })
    ).toEqual({
      background: WORKBENCH_TERMINAL_BACKGROUND,
      foreground: '#111111',
      cursor: '#111111',
      selectionBackground: '#fef0eb'
    })
  })
})
