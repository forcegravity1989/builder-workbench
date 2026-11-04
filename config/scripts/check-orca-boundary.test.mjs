import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { checkRegistry, readDifferences } from './check-orca-boundary.mjs'

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-orca-boundary-'))
  t.after(() => {
    const target = path.resolve(root)
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()))
    assert.ok(path.basename(target).startsWith('bw-orca-boundary-'))
    fs.rmSync(target, { recursive: true, force: true })
  })
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim()
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), text)
  }
  git('init', '-q')
  write('.gitattributes', '* text eol=lf\n')
  write('src/main/host.ts', 'native\n')
  write('src/main/retired.ts', 'native\n')
  write('docs/acceptance.md', 'Host selection must stay on the requested host.\n')
  git('add', '.')
  git(
    '-c',
    'user.name=Boundary test',
    '-c',
    'user.email=boundary@example.invalid',
    'commit',
    '-qm',
    'native'
  )
  const commit = git('rev-parse', 'HEAD')
  const registry = (files) => ({
    version: 1,
    upstream: { commit },
    cases: [
      {
        id: 'host-selection',
        category: 'data-and-host',
        useCase: 'Keep execution on the chosen host.',
        reason: 'The product entry carries host identity.',
        retireWhen: 'The native entry preserves the same host without this override.',
        checks: ['docs/acceptance.md']
      }
    ],
    files: files.map((file) => ({ ...file, cases: ['host-selection'] }))
  })
  return { root, git, write, commit, registry }
}

test('includes tracked, added and deleted native paths while excluding the owned overlay', (t) => {
  const f = fixture(t)
  f.write('src/main/host.ts', 'BW host\n')
  f.write('src/main/new-host.ts', 'new host\n')
  f.write('src/main/workbench/owned.ts', 'BW business\n')
  fs.unlinkSync(path.join(f.root, 'src/main/retired.ts'))
  const differences = readDifferences(f.root, f.commit)
  assert.deepEqual(
    differences.map((item) => item.path),
    ['src/main/host.ts', 'src/main/new-host.ts', 'src/main/retired.ts']
  )
  assert.equal(differences.at(-1).blob, null)
  assert.equal(differences.at(-1).mode, '000000')
})

test('accepts an exact reviewed difference linked to an existing acceptance specification', (t) => {
  const f = fixture(t)
  f.write('src/main/host.ts', 'BW host\n')
  const differences = readDifferences(f.root, f.commit)
  assert.deepEqual(checkRegistry(f.root, f.registry(differences), differences), [])
})

test('requires renewed review when an already registered path changes again', (t) => {
  const f = fixture(t)
  f.write('src/main/host.ts', 'BW host\n')
  const registry = f.registry(readDifferences(f.root, f.commit))
  f.write('src/main/host.ts', 'another host behavior\n')
  assert.match(
    checkRegistry(f.root, registry, readDifferences(f.root, f.commit)).join('\n'),
    /REVIEW src\/main\/host.ts/
  )
})

test('rejects unregistered additions and deletions, including untracked source', (t) => {
  const f = fixture(t)
  f.write('src/main/new-host.ts', 'new host\n')
  fs.unlinkSync(path.join(f.root, 'src/main/retired.ts'))
  const errors = checkRegistry(f.root, f.registry([]), readDifferences(f.root, f.commit))
  assert.ok(errors.some((line) => line.startsWith('REGISTER src/main/new-host.ts')))
  assert.ok(errors.some((line) => line.startsWith('REGISTER src/main/retired.ts')))
})

test('asks to retire a registry entry after it becomes identical to native', (t) => {
  const f = fixture(t)
  f.write('src/main/host.ts', 'BW host\n')
  const registry = f.registry(readDifferences(f.root, f.commit))
  f.write('src/main/host.ts', 'native\n')
  assert.match(
    checkRegistry(f.root, registry, readDifferences(f.root, f.commit)).join('\n'),
    /RETIRE src\/main\/host.ts/
  )
})

test('rejects wildcard exemptions and missing verification references', (t) => {
  const f = fixture(t)
  const registry = f.registry([{ path: 'src/main/*', blob: null }])
  registry.cases[0].checks = ['docs/missing.md']
  const errors = checkRegistry(f.root, registry, [])
  assert.ok(errors.some((line) => line.includes('Invalid, out-of-scope or duplicate path')))
  assert.ok(errors.some((line) => line.includes('missing check/specification')))
  registry.cases[0].checks = ['docs']
  assert.ok(
    checkRegistry(f.root, registry, []).some((line) => line.includes('missing check/specification'))
  )
})

test('covers delivery configuration and rejects restoration of the removed Mobile product', (t) => {
  const f = fixture(t)
  f.write('.github/workflows/release.yml', 'name: publish\n')
  f.write('.gitignore', 'generated/\n')
  f.write('.husky/pre-commit', 'check\n')
  f.write('tsconfig.json', '{}\n')
  f.write('tests/acceptance.test.ts', 'test\n')
  f.write('mobile/app/index.tsx', 'restored product\n')
  const differences = readDifferences(f.root, f.commit)
  assert.deepEqual(
    differences.map((item) => item.path),
    [
      '.github/workflows/release.yml',
      '.gitignore',
      '.husky/pre-commit',
      'tests/acceptance.test.ts',
      'tsconfig.json'
    ]
  )
  assert.ok(
    checkRegistry(f.root, f.registry(differences), differences).some((line) =>
      line.startsWith('REMOVE mobile/')
    )
  )
})

test('requires review for an executable mode change', (t) => {
  const f = fixture(t)
  f.write('src/main/host.ts', 'BW host\n')
  f.git('add', 'src/main/host.ts')
  const registry = f.registry(readDifferences(f.root, f.commit))
  // Match the reviewed worktree on POSIX and the recorded executable bit on Windows.
  fs.chmodSync(path.join(f.root, 'src/main/host.ts'), 0o755)
  f.git('update-index', '--chmod=+x', 'src/main/host.ts')
  const differences = readDifferences(f.root, f.commit)
  assert.equal(differences.find((item) => item.path === 'src/main/host.ts')?.mode, '100755')
  assert.ok(
    checkRegistry(f.root, registry, differences).some((line) =>
      line.startsWith('REVIEW src/main/host.ts')
    )
  )
})

test('fails clearly when the fixed upstream commit is unavailable', (t) => {
  const f = fixture(t)
  assert.throws(() => readDifferences(f.root, 'f'.repeat(40)), /Missing Orca baseline/)
})

test('normalizes Windows line endings using the repository Git attributes', (t) => {
  const f = fixture(t)
  f.write('src/main/host.ts', 'BW host\n')
  const registry = f.registry(readDifferences(f.root, f.commit))
  f.write('src/main/host.ts', 'BW host\r\n')
  assert.deepEqual(checkRegistry(f.root, registry, readDifferences(f.root, f.commit)), [])
})
