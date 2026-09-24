import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createVersionMaterialService,
  materialResult,
  type VersionMaterialHost
} from './version-material-service'
import type { PlanningMaterial, AcceptanceMaterial } from '../../shared/workbench/version-material'
import { createVersionMaterialPort } from '../../shared/workbench/version-material-client'

const plan: PlanningMaterial = {
  schema_version: 3,
  version: 'v0.5',
  cycleId: 'cycle-1',
  summary: { progress: '', risks: '' },
  goals: [{ goalId: 'g1', title: '可编辑的计划', metricTargets: [] }],
  tasks: []
}
const scope = { repoId: 'repo', worktreeId: 'plan', hostId: 'local', workflow: 'plan' as const }
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, stdio: 'pipe' }).toString().trim()

describe('native version material service', () => {
  let directory: string
  let repo: string
  let planning: string
  let acceptance: string
  let host: VersionMaterialHost

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'bw-material-runtime-'))
    repo = join(directory, 'repo')
    planning = join(directory, 'plan')
    acceptance = join(directory, 'acceptance')
    await mkdir(repo)
    git(repo, 'init')
    git(
      repo,
      '-c',
      'user.name=BW Test',
      '-c',
      'user.email=bw@example.test',
      'commit',
      '--allow-empty',
      '-m',
      'fixture'
    )
    git(repo, 'worktree', 'add', '-b', 'bw/week-plan', planning)
    git(repo, 'worktree', 'add', '-b', 'bw/week-acceptance', acceptance)
    host = {
      listRepos: () => [{ id: 'repo', path: repo, kind: 'git' }],
      listWorktrees: async () => [
        { id: 'plan', repoId: 'repo', path: planning, hostId: 'local', isArchived: false },
        { id: 'acceptance', repoId: 'repo', path: acceptance, hostId: 'local', isArchived: false }
      ]
    }
  })

  afterEach(async () => {
    // This test owns the freshly created temporary root, including both linked worktrees.
    await rm(directory, { recursive: true, force: true })
  })

  it('does not create or choose a version; separates branches and exposes legacy/broken candidates', async () => {
    const service = createVersionMaterialService(host)
    expect(await service.list(scope)).toEqual([])
    expect(await service.read({ ...scope, version: 'v0.5' })).toBeNull()
    expect(await readdir(planning)).toEqual(['.git'])
    const saved = await service.save({
      ...scope,
      version: 'v0.5',
      expectedRevision: null,
      document: plan
    })
    const result: AcceptanceMaterial = {
      schema_version: 3,
      version: 'v0.5',
      cycleId: 'acceptance-1',
      planRef: {
        kind: 'draft',
        version: 'v0.5',
        cycleId: plan.cycleId,
        revision: saved.revision,
        sourceHostId: 'local',
        sourceWorktreeId: 'plan'
      },
      preparedArtifacts: [],
      results: []
    }
    await service.save({
      ...scope,
      workflow: 'acceptance',
      worktreeId: 'acceptance',
      version: 'v0.5',
      expectedRevision: null,
      document: result
    })
    expect(
      JSON.parse(await readFile(join(acceptance, '.bw/planning/v0.5/acceptance.json'), 'utf8'))
    ).toEqual(result)
    expect(await readdir(join(planning, '.bw/planning/v0.5'))).toEqual(['data.json'])
    for (const [version, contents] of [
      ['v0.4', '{"schema_version":2}'],
      ['v0.3', '{broken']
    ]) {
      const path = join(planning, '.bw/planning', version)
      await mkdir(path)
      await writeFile(join(path, 'data.json'), contents)
    }
    expect((await service.list(scope)).map(({ version, state }) => ({ version, state }))).toEqual([
      { version: 'v0.3', state: 'invalid' },
      { version: 'v0.4', state: 'migration-required' },
      { version: 'v0.5', state: 'ready' }
    ])
    expect(await createVersionMaterialService(host).read({ ...scope, version: 'v0.5' })).toEqual(
      saved
    )
    expect(await readFile(join(planning, '.bw/planning/v0.4/data.json'), 'utf8')).toBe(
      '{"schema_version":2}'
    )
  })

  it('rejects remote, ambiguous, foreign and stale branch identities before writing', async () => {
    const save = (service = createVersionMaterialService(host), overrides = {}) =>
      service.save({
        ...scope,
        version: 'v0.5',
        expectedRevision: null,
        document: plan,
        ...overrides
      })
    await expect(save(undefined, { hostId: 'ssh:other' })).rejects.toMatchObject({
      code: 'unsupported-host'
    })
    await expect(save(undefined, { worktreeId: 'acceptance' })).rejects.toMatchObject({
      code: 'wrong-branch'
    })
    const repos = host.listRepos()
    const trees = await host.listWorktrees()
    await expect(
      save(createVersionMaterialService({ ...host, listRepos: () => [...repos, ...repos] }))
    ).rejects.toMatchObject({ code: 'invalid-scope' })
    await expect(
      save(
        createVersionMaterialService({
          ...host,
          listRepos: () => [{ ...repos[0], executionHostId: 'runtime:remote' }]
        })
      )
    ).rejects.toMatchObject({ code: 'invalid-scope' })
    const foreign = join(directory, 'foreign')
    await mkdir(foreign)
    git(foreign, 'init', '-b', 'bw/week-plan')
    await expect(
      save(
        createVersionMaterialService({
          ...host,
          listWorktrees: async () => [{ ...trees[0], path: foreign }]
        })
      )
    ).rejects.toMatchObject({ code: 'invalid-scope' })
    git(planning, 'checkout', '--detach')
    await expect(save()).rejects.toMatchObject({ code: 'wrong-branch' })
    expect(await readdir(planning)).toEqual(['.git'])
    expect(await readdir(foreign)).toEqual(['.git'])
  })

  it('keeps a renderer draft on conflict and rechecks authority inside the write lock', async () => {
    const service = createVersionMaterialService(host)
    const port = createVersionMaterialPort(scope, async ({ method, params }) => {
      const operation = method.split('.').at(-1)
      const result = await materialResult(() =>
        operation === 'save'
          ? service.save(params as Parameters<typeof service.save>[0])
          : service.read(params as Parameters<typeof service.read>[0])
      )
      return { id: 'test', ok: true, result, _meta: { runtimeId: 'test' } }
    })
    const saved = await port.save({ version: 'v0.5', expectedRevision: null, document: plan })
    const changed = { ...plan, summary: { progress: '模型新修改', risks: '' } }
    const current = await service.save({
      ...scope,
      version: 'v0.5',
      expectedRevision: saved.revision,
      document: changed
    })
    const draft = { ...plan, summary: { progress: '页面未保存输入', risks: '' } }
    await expect(
      port.save({ version: 'v0.5', expectedRevision: saved.revision, document: draft })
    ).rejects.toMatchObject({ code: 'revision-conflict', currentRevision: current.revision })
    expect(draft.summary.progress).toBe('页面未保存输入')
    expect((await port.read('v0.5'))?.document).toEqual(changed)
    let checks = 0
    const guarded = createVersionMaterialService({
      ...host,
      listWorktrees: async () => {
        if (++checks === 2) {
          git(planning, 'checkout', '--detach')
        }
        return host.listWorktrees()
      }
    })
    await expect(
      guarded.save({
        ...scope,
        version: 'v0.5',
        expectedRevision: current.revision,
        document: draft
      })
    ).rejects.toMatchObject({ code: 'wrong-branch' })
    expect(
      JSON.parse(await readFile(join(planning, '.bw/planning/v0.5/data.json'), 'utf8'))
    ).toEqual(changed)
    expect(await readdir(join(planning, '.bw/planning/v0.5'))).toEqual(['data.json'])
  })
})
