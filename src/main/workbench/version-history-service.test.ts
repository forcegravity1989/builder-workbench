import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PlanningMaterial } from '../../shared/workbench/version-material'
import { createVersionHistoryService } from './version-history-service'

const scope = { repoId: 'registered-repo', worktreeId: 'acceptance-tree', hostId: 'local' }
let root: string
let adoptedCommit: string
let firstCommit: string
let unmergedCommit: string
let mergeCommit: string
let firstRevision: string
const plan: PlanningMaterial = {
  schema_version: 3,
  version: 'v1',
  cycleId: 'first-cycle',
  summary: { progress: '原承诺', risks: '' },
  goals: [],
  tasks: []
}
const digest = (raw: Buffer) => `sha256:${createHash('sha256').update(raw).digest('hex')}`
const git = (args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' })
const commit = (message: string) => {
  git(['add', '.bw/planning/v1/data.json'])
  git(['commit', '-m', message])
  return git(['rev-parse', 'HEAD']).toString().trim()
}
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'bw-history-'))
  git(['init', '--initial-branch=adopted'])
  git(['config', 'user.name', 'Test'])
  git(['config', 'user.email', 'test@example.invalid'])
  git(['config', 'core.autocrlf', 'false'])
  mkdirSync(join(root, '.bw/planning/v1'), { recursive: true })
  const raw = Buffer.from(`${JSON.stringify(plan, null, 2).replace(/\n/g, '\r\n')}\r\n`)
  writeFileSync(join(root, '.bw/planning/v1/data.json'), raw)
  firstRevision = digest(raw)
  firstCommit = commit('first cycle')
  writeFileSync(
    join(root, '.bw/planning/v1/data.json'),
    JSON.stringify({ ...plan, cycleId: 'second-cycle' })
  )
  commit('second cycle')
  mkdirSync(join(root, '.bw/planning/legacy'), { recursive: true })
  writeFileSync(join(root, '.bw/planning/legacy/data.json'), '{"schema_version":2}')
  git(['add', '.bw/planning/legacy/data.json'])
  git(['commit', '-m', 'legacy record'])
  adoptedCommit = git(['rev-parse', 'HEAD']).toString().trim()
  git(['switch', '-c', 'unmerged'])
  writeFileSync(
    join(root, '.bw/planning/v1/data.json'),
    JSON.stringify({ ...plan, cycleId: 'unmerged-cycle' })
  )
  unmergedCommit = commit('unmerged draft')
  git(['switch', 'adopted'])
  git(['switch', '-c', 'maintenance'])
  writeFileSync(
    join(root, '.bw/planning/v1/data.json'),
    JSON.stringify({ ...plan, cycleId: 'intermediate-draft' })
  )
  commit('draft before review')
  writeFileSync(
    join(root, '.bw/planning/v1/data.json'),
    JSON.stringify({ ...plan, cycleId: 'third-cycle' })
  )
  commit('reviewed cycle')
  git(['switch', 'adopted'])
  git(['merge', '--no-ff', 'maintenance', '-m', 'adopt third cycle'])
  mergeCommit = git(['rev-parse', 'HEAD']).toString().trim()
  adoptedCommit = mergeCommit
})
afterAll(() => {
  if (root) {
    const target = resolve(root)
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('bw-history-')) {
      throw new Error('Unexpected test repository location')
    }
    rmSync(target, { recursive: true, force: true })
  }
})

function service() {
  return createVersionHistoryService({
    async git(_scope, args) {
      return git(args)
    },
    async baseline() {
      return { ref: 'adopted', commit: adoptedCommit }
    },
    async readDraft(draftScope, version) {
      expect(draftScope).toEqual({ ...scope, worktreeId: 'plan-tree' })
      expect(version).toBe('v1')
      const raw = readFileSync(join(root, '.bw/planning/v1/data.json'))
      return { document: JSON.parse(raw.toString()) as PlanningMaterial, revision: digest(raw) }
    }
  })
}

it('reads exact committed bytes and indexes multiple cycles without using the latest plan as a fallback', async () => {
  const port = service()
  const planRef = {
    kind: 'committed' as const,
    version: 'v1',
    cycleId: 'first-cycle',
    revision: firstRevision,
    sourceCommit: firstCommit
  }
  const result = await port.readPlan({ scope, planRef })
  expect(result.document).toEqual(plan)
  expect(result.revision).toBe(firstRevision)
  expect(result.source).toEqual({
    kind: 'committed',
    sourceCommit: firstCommit,
    baselineRef: 'adopted',
    baselineCommit: adoptedCommit
  })
  const catalog = await port.list({ scope })
  expect(catalog.records.map((record) => record.cycleId)).toEqual([
    'third-cycle',
    'second-cycle',
    'first-cycle'
  ])
  expect(catalog.records[0].sourceCommit).toBe(mergeCommit)
  expect(catalog.problems).toEqual([
    expect.objectContaining({ version: 'legacy', code: 'migration-required' })
  ])
  await expect(
    port.readPlan({ scope, planRef: { ...planRef, sourceCommit: unmergedCommit } })
  ).rejects.toMatchObject({ code: 'unverified-source' })
  await expect(
    port.readPlan({ scope, planRef: { ...planRef, cycleId: 'second-cycle' } })
  ).rejects.toMatchObject({ code: 'history-identity-mismatch' })
  await expect(
    port.readPlan({ scope, planRef: { ...planRef, revision: `sha256:${'0'.repeat(64)}` } })
  ).rejects.toMatchObject({ code: 'history-identity-mismatch' })
})

it('keeps a draft source explicit and rejects a changed draft revision', async () => {
  const raw = readFileSync(join(root, '.bw/planning/v1/data.json'))
  const planRef = {
    kind: 'draft' as const,
    version: 'v1',
    cycleId: 'third-cycle',
    revision: digest(raw),
    sourceHostId: 'local',
    sourceWorktreeId: 'plan-tree'
  }
  const result = await service().readPlan({ scope, planRef })
  expect(result.source).toEqual({
    kind: 'draft',
    sourceHostId: 'local',
    sourceWorktreeId: 'plan-tree'
  })
  await expect(
    service().readPlan({ scope, planRef: { ...planRef, revision: firstRevision } })
  ).rejects.toMatchObject({ code: 'history-identity-mismatch' })
})
