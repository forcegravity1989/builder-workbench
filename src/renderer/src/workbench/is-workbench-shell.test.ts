import { describe, expect, it } from 'vitest'
import { isWorkbenchShell } from './is-workbench-shell'

describe('isWorkbenchShell', () => {
  it('reads the Vite compile-time flag', () => {
    expect(typeof isWorkbenchShell()).toBe('boolean')
  })
})
