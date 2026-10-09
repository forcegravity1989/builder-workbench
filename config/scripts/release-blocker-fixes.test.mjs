import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectDir = resolve(import.meta.dirname, '../..')

describe('release blocker safeguards', () => {
  it('keeps the root package version on the current stable release line', () => {
    const packageJson = JSON.parse(readFileSync(resolve(projectDir, 'package.json'), 'utf8'))
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(packageJson.version)
    expect(match).not.toBeNull()
    const version = match.slice(1, 4).map(Number)
    const isAtLeastStable =
      version[0] > 1 ||
      (version[0] === 1 && (version[1] > 4 || (version[1] === 4 && version[2] >= 196)))
    expect(isAtLeastStable).toBe(true)
  })
})
