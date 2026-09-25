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
let ffCommit: string
let rebaseCommit: string
let unknownCommit: string
let firstRevision: string
const adopted = new Set<string>()
const drafts = new Set<string>()
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
  adopted.add(firstCommit)
  writeFileSync(
    join(root, '.bw/planning/v1/data.json'),
    JSON.stringify({ ...plan, cycleId: 'second-cycle' })
  )
  adopted.add(commit('second cycle'))
  mkdirSync(join(root, '.bw/planning/legacy'), { recursive: true })
  writeFileSync(join(root, '.bw/planning/legacy/data.json'), '{"schema_version":2}')
  mkdirSync(join(root, '.bw/planning/template'), { recursive: true })
  writeFileSync(join(root, '.bw/planning/template/data.json'), JSON.stringify(plan))
  mkdirSync(join(root, '.bw/planning/unverified'), { recursive: true })
  writeFileSync(
    join(root, '.bw/planning/unverified/data.json'),
    JSON.stringify({ ...plan, version: 'unverified' })
  )
  git([
    'add',
    '.bw/planning/legacy/data.json',
    '.bw/planning/template/data.json',
    '.bw/planning/unverified/data.json'
  ])
  git(['commit', '-m', 'records requiring verification'])
  unknownCommit = git(['rev-parse', 'HEAD']).toString().trim()
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
  drafts.add(commit('draft before review'))
  writeFileSync(
    join(root, '.bw/planning/v1/data.json'),
    JSON.stringify({ ...plan, cycleId: 'third-cycle' })
  )
  drafts.add(commit('reviewed cycle'))
  git(['switch', 'adopted'])
  git(['merge', '--no-ff', 'maintenance', '-m', 'adopt third cycle'])
  mergeCommit = git(['rev-parse', 'HEAD']).toString().trim()
  adopted.add(mergeCommit)
  git(['switch', '-c', 'fast-forward'])
  writeFileSync(
    join(root, '.bw/planning/v1/data.json'),
    JSON.stringify({ ...plan, cycleId: 'ff-draft' })
  )
  drafts.add(commit('ff intermediate draft'))
  writeFileSync(
    join(root, '.bw/planning/v1/data.json'),
    JSON.stringify({ ...plan, cycleId: 'fourth-cycle' })
  )
  ffCommit = commit('ff adopted cycle')
  adopted.add(ffCommit)
  git(['switch', 'adopted'])
  git(['merge', '--ff-only', 'fast-forward'])
  git(['switch', '-c', 'rebased'])
  writeFileSync(
    join(root, '.bw/planning/v1/data.json'),
    JSON.stringify({ ...plan, cycleId: 'rebase-draft' })
  )
  commit('rebase intermediate draft')
  writeFileSync(
    join(root, '.bw/planning/v1/data.json'),
    JSON.stringify({ ...plan, cycleId: 'fifth-cycle' })
  )
  commit('rebase adopted cycle')
  git(['switch', 'adopted'])
  git(['commit', '--allow-empty', '-m', 'advance adopted baseline'])
  git(['switch', 'rebased'])
  git(['rebase', 'adopted'])
  drafts.add(git(['rev-parse', 'HEAD^']).toString().trim())
  rebaseCommit = git(['rev-parse', 'HEAD']).toString().trim()
  adopted.add(rebaseCommit)
  git(['switch', 'adopted'])
  git(['merge', '--ff-only', 'rebased'])
  adoptedCommit = rebaseCommit
}, 20_000)
afterAll(() => {
  if (root) {
    const target = resolve(root)
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('bw-history-')) {
      throw new Error('Unexpected test repository location')
    }
    rmSync(target, { recursive: true, force: true })
  }
})

function service(mismatchedProof = false) {
  return createVersionHistoryService({
    async git(_scope, args) {
      return git(args)
    },
    async baseline() {
      return { ref: 'adopted', commit: adoptedCommit }
    },
    async archiveState(_scope, candidate) {
      if (adopted.has(candidate.sourceCommit)) {
        return {
          kind: 'adopted',
          proof: {
            reference: {
              provider: 'github',
              repository: 'test/project',
              number: 1,
              materialRevision: candidate.revision
            },
            mergeCommit: mismatchedProof ? '0'.repeat(40) : candidate.sourceCommit,
            material: {
              workflow: candidate.workflow,
              version: candidate.version,
              cycleId: candidate.cycleId,
              revision: candidate.revision
            },
            checkedAt: '2026-09-25T00:00:00Z'
          }
        }
      }
      if (drafts.has(candidate.sourceCommit)) {
        return { kind: 'draft' }
      }
      return { kind: 'unknown', message: '未取得该修订的真实归档依据' }
    },
    async readDraft(draftScope, version) {
      expect(draftScope).toEqual({ ...scope, worktreeId: 'plan-tree' })
      expect(version).toBe('v1')
      const raw = readFileSync(join(root, '.bw/planning/v1/data.json'))
      return { document: JSON.parse(raw.toString()) as PlanningMaterial, revision: digest(raw) }
    }
  })
}

it('uses explicit archive evidence across no-ff, ff and rebase history while preserving invalid candidates', async () => {
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
    'fifth-cycle',
    'fourth-cycle',
    'third-cycle',
    'second-cycle',
    'first-cycle'
  ])
  expect(catalog.records.slice(0, 3).map((record) => record.sourceCommit)).toEqual([
    rebaseCommit,
    ffCommit,
    mergeCommit
  ])
  expect(catalog.problems).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ version: 'legacy', code: 'migration-required' }),
      expect.objectContaining({
        version: 'template',
        code: 'invalid-version',
        message: expect.stringContaining('.bw/planning/template/data.json')
      }),
      expect.objectContaining({
        version: 'unverified',
        code: 'archive-unverified',
        sourceCommit: unknownCommit
      })
    ])
  )
  expect(catalog.problems).toHaveLength(3)
  await expect(
    port.read({
      scope,
      sourceCommit: unknownCommit,
      version: 'unverified',
      cycleId: 'first-cycle',
      workflow: 'plan'
    })
  ).rejects.toMatchObject({ code: 'archive-unverified' })
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

it('rejects a well-formed archive proof for a different fixed commit', async () => {
  await expect(
    service(true).read({
      scope,
      sourceCommit: firstCommit,
      version: 'v1',
      cycleId: 'first-cycle',
      workflow: 'plan'
    })
  ).rejects.toMatchObject({ code: 'archive-unverified' })
})

it('keeps a draft source explicit and rejects a changed draft revision', async () => {
  const raw = readFileSync(join(root, '.bw/planning/v1/data.json'))
  const planRef = {
    kind: 'draft' as const,
    version: 'v1',
    cycleId: 'fifth-cycle',
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
