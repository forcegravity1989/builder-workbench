import { describe, expect, it } from 'vitest'
import { orcadNodeRuntimeRelativePath } from './orcad-artifacts'

describe('standalone runtime artifacts', () => {
  it('keeps the runtime executable under its upstream name in the shared store', () => {
    expect(orcadNodeRuntimeRelativePath('linux-x64-glibc', 'a'.repeat(64))).toEqual([
      '..',
      'runtimes',
      `node-${'a'.repeat(64)}`,
      'bin',
      'node'
    ])
    expect(orcadNodeRuntimeRelativePath('win32-x64', 'b'.repeat(64)).at(-1)).toBe('node.exe')
  })
})
