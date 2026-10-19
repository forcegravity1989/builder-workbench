import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  WORKBENCH_RELEASE_ASSETS,
  assertPublishAuthorized,
  buildGhReleaseCreateArgs,
  deriveReleaseTag,
  isPrereleaseTag,
  parseReleaseArgs,
  resolveReleaseVersion,
  runWorkbenchRelease,
  selectReleaseAssets
} from './release-win-workbench.mjs'

const tempDirs = []
function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'wb-release-test-'))
  tempDirs.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('parseReleaseArgs', () => {
  it('defaults to prepare (dry-run) without --publish', () => {
    const args = parseReleaseArgs([])
    expect(args.publish).toBe(false)
    expect(args.dryRun).toBe(true)
    expect(args.target).toBe('HEAD')
    expect(args.distDir).toBe('dist')
  })

  it('reads valued flags and treats --publish as the authorization gate', () => {
    const args = parseReleaseArgs([
      '--version',
      '0.6.0-rc.1',
      '--notes-file',
      'notes.md',
      '--target',
      'abc123',
      '--dist-dir',
      'out',
      '--build',
      '--allow-dirty',
      '--publish'
    ])
    expect(args).toMatchObject({
      version: '0.6.0-rc.1',
      notesFile: 'notes.md',
      target: 'abc123',
      distDir: 'out',
      build: true,
      allowDirty: true,
      publish: true,
      dryRun: false
    })
  })

  it('rejects unknown arguments and missing values', () => {
    expect(() => parseReleaseArgs(['--nope'])).toThrow(/Unknown argument/)
    expect(() => parseReleaseArgs(['--version'])).toThrow(/Missing value/)
  })
})

describe('version and tag', () => {
  it('prefers explicit version, falls back to package version', () => {
    expect(resolveReleaseVersion({ explicitVersion: ' 1.2.3 ', packageVersion: '9.9.9' })).toBe(
      '1.2.3'
    )
    expect(resolveReleaseVersion({ explicitVersion: null, packageVersion: '0.6.0' })).toBe('0.6.0')
  })

  it('throws when no version is available', () => {
    expect(() => resolveReleaseVersion({ explicitVersion: '', packageVersion: '' })).toThrow(
      /No version/
    )
  })

  it('derives a valid tag and rejects malformed versions', () => {
    expect(deriveReleaseTag('0.6.0')).toBe('v0.6.0')
    expect(deriveReleaseTag('0.5.0-rc.20261011.4')).toBe('v0.5.0-rc.20261011.4')
    expect(() => deriveReleaseTag('not-a-version')).toThrow(/valid Workbench release tag/)
  })

  it('detects prerelease from the -rc.YYYYMMDD.N suffix', () => {
    expect(isPrereleaseTag('v0.5.0-rc.20261007.3')).toBe(true)
    expect(isPrereleaseTag('v0.6.0')).toBe(false)
  })
})

describe('selectReleaseAssets', () => {
  it('reports all three Workbench assets missing for an empty dist', () => {
    const { assets, missing } = selectReleaseAssets(makeTempDir())
    expect(assets.map((a) => a.name)).toEqual(WORKBENCH_RELEASE_ASSETS)
    expect(missing).toEqual(WORKBENCH_RELEASE_ASSETS)
  })

  it('reports assets present once they exist', () => {
    const dir = makeTempDir()
    for (const name of WORKBENCH_RELEASE_ASSETS) {
      writeFileSync(join(dir, name), 'x')
    }
    const { missing } = selectReleaseAssets(dir)
    expect(missing).toEqual([])
  })
})

describe('buildGhReleaseCreateArgs', () => {
  const base = {
    tag: 'v0.6.0',
    assetPaths: ['dist/orca-windows-setup.exe', 'dist/latest.yml'],
    target: 'abc123',
    title: 'Workbench 0.6.0',
    notesFile: 'notes.md'
  }

  it('omits --prerelease for a stable tag', () => {
    const args = buildGhReleaseCreateArgs({ ...base, prerelease: false })
    expect(args).toEqual([
      'release',
      'create',
      'v0.6.0',
      'dist/orca-windows-setup.exe',
      'dist/latest.yml',
      '--target',
      'abc123',
      '--title',
      'Workbench 0.6.0',
      '--notes-file',
      'notes.md'
    ])
    expect(args).not.toContain('--generate-notes')
  })

  it('appends --prerelease for an rc tag', () => {
    expect(buildGhReleaseCreateArgs({ ...base, prerelease: true })).toContain('--prerelease')
  })
})

describe('assertPublishAuthorized', () => {
  it('is a no-op in prepare mode', () => {
    expect(() => assertPublishAuthorized({ publish: false, notesFile: null })).not.toThrow()
  })

  it('refuses to publish without a notes file (never auto-generates)', () => {
    expect(() => assertPublishAuthorized({ publish: true, notesFile: null })).toThrow(
      /requires --notes-file/
    )
  })

  it('refuses to publish when the notes file is missing', () => {
    expect(() => assertPublishAuthorized({ publish: true, notesFile: 'nope.md' })).toThrow(
      /not found/
    )
  })

  it('allows publish when the notes file exists', () => {
    const dir = makeTempDir()
    const notes = join(dir, 'notes.md')
    writeFileSync(notes, '## body')
    expect(() => assertPublishAuthorized({ publish: true, notesFile: notes })).not.toThrow()
  })
})

describe('runWorkbenchRelease guards (prepare mode)', () => {
  function fakeExec(overrides) {
    return (command, args) => {
      const key = `${command} ${args.join(' ')}`
      for (const [pattern, value] of Object.entries(overrides)) {
        if (key.includes(pattern)) {
          if (value instanceof Error) {
            throw value
          }
          return value
        }
      }
      throw new Error(`unexpected exec: ${key}`)
    }
  }

  function makeProject(withAssets) {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '0.6.0' }))
    if (withAssets) {
      mkdirSync(join(dir, 'dist'))
      for (const name of WORKBENCH_RELEASE_ASSETS) {
        writeFileSync(join(dir, 'dist', name), 'x')
      }
    }
    return dir
  }

  const baseExec = {
    'rev-parse HEAD': 'abc123def456789abc123def456789abc123def4\n',
    'status --porcelain': '',
    'auth status': 'Logged in to github.com\n',
    'release view': new Error('release not found')
  }

  it('flags missing assets and HEAD-not-on-remote, stays in prepare (never publishes)', async () => {
    const result = await runWorkbenchRelease({
      argv: [],
      cwd: makeProject(false),
      log: () => {},
      exec: fakeExec({ ...baseExec, 'branch -r --contains': '\n' })
    })
    expect(result.mode).toBe('prepare')
    expect(result.tag).toBe('v0.6.0')
    expect(result.blockers.some((b) => b.includes('缺资产'))).toBe(true)
    expect(result.blockers.some((b) => b.includes('不在任何远端分支'))).toBe(true)
    expect(result.wouldRun).toContain('gh release create v0.6.0')
  })

  it('reports no blockers when assets exist and HEAD is on a remote branch', async () => {
    const result = await runWorkbenchRelease({
      argv: [],
      cwd: makeProject(true),
      log: () => {},
      exec: fakeExec({ ...baseExec, 'branch -r --contains': '  origin/main\n' })
    })
    expect(result.mode).toBe('prepare')
    expect(result.blockers).toEqual([])
    expect(result.wouldRun).toContain('orca-windows-setup.exe')
  })

  it('blocks when the tag already has a published release', async () => {
    const result = await runWorkbenchRelease({
      argv: [],
      cwd: makeProject(true),
      log: () => {},
      exec: fakeExec({
        ...baseExec,
        'branch -r --contains': '  origin/main\n',
        'release view': JSON.stringify({ tagName: 'v0.6.0', isDraft: false })
      })
    })
    expect(result.blockers.some((b) => b.includes('已发布，不覆盖'))).toBe(true)
  })
})
