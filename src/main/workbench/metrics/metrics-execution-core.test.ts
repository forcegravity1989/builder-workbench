import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import {
  METRICS_MAINTENANCE_BRANCH,
  catchUpMetricsMaintenance,
  computeMetricsCheckoutRoot,
  executeMetricCollection,
  fingerprintMetricCollector,
  readMetricConfiguration
} from './metrics-execution-core'

let root: string
let emptyCommit: string
let configCommit: string
let scriptCommit: string
const collectScript = [
  'const args = process.argv.slice(2);',
  'const at = (flag) => args[args.indexOf(flag) + 1];',
  'console.error(JSON.stringify({',
  '  tz: process.env.BW_METRICS_TIMEZONE,',
  '  root: process.env.BW_METRICS_DATA_ROOT,',
  '  commit: process.env.BW_METRICS_DATA_COMMIT,',
  '  since: at("--since"), until: at("--until"), granularity: at("--granularity"),',
  '  cwdIsCheckout: process.cwd() !== process.env.BW_METRICS_DATA_ROOT',
  '}));',
  'console.log(JSON.stringify({ points: [{ day: at("--since"), value: 1 }] }));'
].join('\n')
const toml = [
  'schema_version = 2',
  '[[lagging]]',
  'name = "commits"',
  'def = "weekly commits"',
  'collect = { kind = "script", run = ["node", ".bw/scripts/collect.js"], retro = true }'
].join('\n')

const git = (args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' })
const head = () => git(['rev-parse', 'HEAD']).toString().trim()
const write = (relative: string, content: string) => {
  const target = join(root, relative)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content)
  git(['add', relative])
}
const commit = (message: string) => {
  git(['commit', '-m', message])
  return head()
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'bw-metrics-core-'))
  git(['init', '--initial-branch=main'])
  git(['config', 'user.name', 'Test'])
  git(['config', 'user.email', 'test@example.invalid'])
  git(['config', 'core.autocrlf', 'false'])
  write('README.md', 'data repo')
  emptyCommit = commit('empty base')
  write('.bw/metrics.toml', toml)
  write('.bw/scripts/collect.js', collectScript)
  configCommit = commit('adopted configuration')
  write('.bw/scripts/collect.js', `${collectScript}\n// revised collector`)
  scriptCommit = commit('revised script')
}, 30_000)

afterAll(() => {
  if (root) {
    const target = resolve(root)
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('bw-metrics-core-')) {
      throw new Error('Unexpected test repository location')
    }
    rmSync(target, { recursive: true, force: true })
  }
})

it('reads the configuration from the trunk baseline pinned to a real SHA', async () => {
  const snapshot = await readMetricConfiguration({ repoPath: root, pinnedRef: null })
  expect(snapshot.configurationRef).toBe('main')
  expect(snapshot.configurationCommit).toBe(scriptCommit)
  expect(snapshot.dataCommit).toBe(scriptCommit)
  expect(snapshot.toml).toContain('schema_version = 2')
  expect(snapshot.draft).toBeNull()
  expect(snapshot.timezone.length).toBeGreaterThan(0)
  const missing = await readMetricConfiguration({
    repoPath: root,
    pinnedRef: null,
    configurationCommit: emptyCommit
  })
  expect(missing.toml).toBeNull()

  git(['branch', METRICS_MAINTENANCE_BRANCH, configCommit])
  await catchUpMetricsMaintenance({ repoPath: root, baselineCommit: scriptCommit })
  expect(git(['rev-parse', METRICS_MAINTENANCE_BRANCH]).toString().trim()).toBe(scriptCommit)

  git(['switch', METRICS_MAINTENANCE_BRANCH])
  write('.bw/metrics.toml', toml.replace('commits', 'discussion'))
  const ahead = commit('maintenance catalog')
  git(['switch', 'main'])
  const adopted = await readMetricConfiguration({ repoPath: root, pinnedRef: null })
  expect(adopted.configurationRef).toBe(METRICS_MAINTENANCE_BRANCH)
  expect(adopted.configurationCommit).toBe(ahead)
  expect(adopted.dataCommit).toBe(scriptCommit)
  expect(adopted.toml).toContain('discussion')
  writeFileSync(join(root, '.bw/metrics.toml'), 'uncommitted draft')
  const draft = await readMetricConfiguration({ repoPath: root, pinnedRef: null })
  expect(draft.configurationCommit).toBe(ahead)
  expect(draft.draft).toBeNull()
  expect(draft.toml).toContain('discussion')
  const preview = join(dirname(root), `${basename(root)}-preview`)
  git(['worktree', 'add', preview, METRICS_MAINTENANCE_BRANCH])
  try {
    writeFileSync(join(preview, '.bw/metrics.toml'), toml.replace('commits', 'live-draft'))
    const live = await readMetricConfiguration({
      repoPath: root,
      pinnedRef: null,
      previewMaintenanceWorktree: true
    })
    expect(live.toml).toContain('live-draft')
    expect(live.draft).toMatch(/^[a-f0-9]{64}$/)
    expect(live.configurationRef).toBe(METRICS_MAINTENANCE_BRANCH)
    expect(live.configurationCommit).toBe(ahead)
    expect(live.dataCommit).toBe(scriptCommit)
    const pinned = await readMetricConfiguration({
      repoPath: root,
      pinnedRef: null,
      configurationCommit: ahead,
      previewMaintenanceWorktree: true
    })
    expect(pinned.toml).toContain('discussion')
    expect(pinned.draft).toBeNull()
  } finally {
    git(['worktree', 'remove', '--force', preview])
  }
  git(['checkout', '--', '.bw/metrics.toml'])
  git(['branch', '-D', METRICS_MAINTENANCE_BRANCH])
})

it('reports an invalid pinned base ref instead of switching branches', async () => {
  await expect(
    readMetricConfiguration({ repoPath: root, pinnedRef: 'release' })
  ).rejects.toMatchObject({ code: 'baseline-invalid' })
})

it('fingerprints the pinned script content, not the interpreter token', async () => {
  const run = ['node', '.bw/scripts/collect.js']
  const atConfig = await fingerprintMetricCollector({
    repoPath: root,
    configurationCommit: configCommit,
    run
  })
  const again = await fingerprintMetricCollector({
    repoPath: root,
    configurationCommit: configCommit,
    run
  })
  const atScript = await fingerprintMetricCollector({
    repoPath: root,
    configurationCommit: scriptCommit,
    run
  })
  expect(atConfig).toMatch(/^sha256:[a-f0-9]{64}$/)
  expect(again).toBe(atConfig)
  expect(atScript).not.toBe(atConfig)
})

it('runs the collector in the fixed checkout with protocol env and discards it', async () => {
  const outcome = await executeMetricCollection({
    repoPath: root,
    checkoutRoot: computeMetricsCheckoutRoot(root),
    configurationCommit: scriptCommit,
    run: [process.execPath, '.bw/scripts/collect.js'],
    args: ['--since', '2026-09-21', '--until', '2026-09-22', '--granularity', 'day'],
    env: {
      BW_METRICS_TIMEZONE: 'Asia/Shanghai',
      BW_METRICS_DATA_ROOT: root,
      BW_METRICS_DATA_COMMIT: scriptCommit
    },
    timeoutMs: 60_000
  })
  expect(outcome.code).toBe(0)
  expect(outcome.timedOut).toBe(false)
  expect(outcome.outputTruncated).toBe(false)
  expect(JSON.parse(outcome.stdout)).toEqual({
    points: [{ day: '2026-09-21', value: 1 }]
  })
  const diagnostics = JSON.parse(outcome.stderr)
  expect(diagnostics).toMatchObject({
    tz: 'Asia/Shanghai',
    root: root,
    commit: scriptCommit,
    since: '2026-09-21',
    until: '2026-09-22',
    granularity: 'day',
    cwdIsCheckout: true
  })
  const worktrees = git(['worktree', 'list']).toString()
  expect(worktrees).not.toContain('.orca-preparing')
}, 60_000)

it('reports a failing collector exit without inventing a reading', async () => {
  write('.bw/scripts/fail.js', 'console.error("collector exploded"); process.exit(3)')
  const failCommit = commit('failing collector')
  const outcome = await executeMetricCollection({
    repoPath: root,
    checkoutRoot: computeMetricsCheckoutRoot(root),
    configurationCommit: failCommit,
    run: [process.execPath, '.bw/scripts/fail.js'],
    args: ['--since', '2026-09-21', '--until', '2026-09-22', '--granularity', 'day'],
    env: {},
    timeoutMs: 60_000
  })
  expect(outcome.code).toBe(3)
  expect(outcome.stderr).toContain('collector exploded')
  const worktrees = git(['worktree', 'list']).toString()
  expect(worktrees).not.toContain('.orca-preparing')
}, 60_000)

it('kills a hung collector at its timeout and still cleans the checkout up', async () => {
  write('.bw/scripts/hang.js', 'setTimeout(() => {}, 30000)')
  const hangCommit = commit('hanging collector')
  const outcome = await executeMetricCollection({
    repoPath: root,
    checkoutRoot: computeMetricsCheckoutRoot(root),
    configurationCommit: hangCommit,
    run: [process.execPath, '.bw/scripts/hang.js'],
    args: ['--since', '2026-09-21', '--until', '2026-09-22', '--granularity', 'day'],
    env: {},
    timeoutMs: 1_500
  })
  expect(outcome.timedOut).toBe(true)
  const worktrees = git(['worktree', 'list']).toString()
  expect(worktrees).not.toContain('.orca-preparing')
}, 60_000)

it('reads the pinned trunk baseline without fetching or touching anything', async () => {
  const remote = join(root, 'remote.git')
  const author = join(root, 'author')
  git(['init', '--bare', remote])
  git(['remote', 'add', 'origin', remote])
  git(['push', '--set-upstream', 'origin', 'main'])
  git(['clone', '--branch', 'main', remote, author])
  const authorGit = (args: string[]) => execFileSync('git', args, { cwd: author, stdio: 'pipe' })
  authorGit(['config', 'user.name', 'Test'])
  authorGit(['config', 'user.email', 'test@example.invalid'])
  writeFileSync(join(author, '.bw/metrics.toml'), toml.replace('commits', 'new metric'))
  authorGit(['add', '.bw/metrics.toml'])
  authorGit(['commit', '-m', 'adopt new metric'])
  authorGit(['push', 'origin', 'main'])
  const adopted = authorGit(['rev-parse', 'HEAD']).toString().trim()
  const before = head()
  expect(adopted).not.toBe(before)
  writeFileSync(join(root, 'README.md'), 'unfinished plan work')
  // The trunk baseline is a local read: the remote moving on neither fetches
  // new commits nor touches the checkout — freshness is the button's job.
  const snapshot = await readMetricConfiguration({ repoPath: root, pinnedRef: 'main' })
  expect(snapshot.configurationCommit).toBe(before)
  expect(snapshot.dataCommit).toBe(before)
  expect(snapshot.toml).not.toContain('new metric')
  expect(head()).toBe(before)
  // The origin/main bookmark stays where the push left it: proof that reading
  // the configuration never fetched behind the scenes.
  expect(git(['rev-parse', 'refs/remotes/origin/main']).toString().trim()).toBe(before)
  expect(readFileSync(join(root, 'README.md'), 'utf8')).toBe('unfinished plan work')
}, 60_000)
