import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { describeDshProfilesMissingHookPackages } from './dsh-hook-packages'

it('requires the executor and protocol in each initialized profile', () => {
  const home = mkdtempSync(join(tmpdir(), 'bw-dsh-packages-'))
  try {
    expect(describeDshProfilesMissingHookPackages(home)).toBeNull()
    const profile = join(home, 'profiles', 'dsh-tui')
    mkdirSync(profile, { recursive: true })
    writeFileSync(join(profile, 'package.json'), '{}')
    expect(describeDshProfilesMissingHookPackages(home)).toContain('dsh-tui')
    for (const pkg of ['dsh-hooks-claude-code', 'dsh-hook-protocol']) {
      const dir = join(profile, 'node_modules', '@deepseek-ai', pkg)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'package.json'), '{}')
    }
    expect(describeDshProfilesMissingHookPackages(home)).toBeNull()
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
