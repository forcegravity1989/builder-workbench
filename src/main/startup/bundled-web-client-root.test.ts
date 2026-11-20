import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findBundledWebClientRoot } from './bundled-web-client-root'

const tempDirs: string[] = []

function makeContainer(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orca-web-client-root-'))
  tempDirs.push(dir)
  return dir
}

function makeWebClientRoot(parent: string, name: string): string {
  const root = join(parent, name)
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'web-index.html'), '<!doctype html>')
  return root
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true })
  }
})

describe('findBundledWebClientRoot', () => {
  it('prefers the dev standalone out/web bundle over out/renderer', () => {
    const appPath = makeContainer()
    makeWebClientRoot(join(appPath, 'out'), 'renderer')
    const webRoot = makeWebClientRoot(join(appPath, 'out'), 'web')

    expect(findBundledWebClientRoot(appPath)).toBe(webRoot)
  })

  it('serves the packaged app from out/renderer when out/web is absent', () => {
    const appPath = makeContainer()
    const rendererRoot = makeWebClientRoot(join(appPath, 'out'), 'renderer')

    expect(findBundledWebClientRoot(appPath)).toBe(rendererRoot)
  })

  it('falls back to the sibling roots of unpacked entrypoints', () => {
    // Why: unpacked electron-vite entrypoints set appPath to out/main, whose
    // parent carries the built bundles.
    const container = makeContainer()
    const appPath = join(container, 'out', 'main')
    mkdirSync(appPath, { recursive: true })
    const rendererRoot = makeWebClientRoot(join(container, 'out'), 'renderer')

    expect(findBundledWebClientRoot(appPath)).toBe(rendererRoot)
  })

  it('returns undefined when no bundle exists', () => {
    const appPath = makeContainer()

    expect(findBundledWebClientRoot(appPath)).toBeUndefined()
  })
})
