import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createVersionMaterialService as createService,
  materialResult,
  type VersionMaterialHost
} from './version-material-service'
import type { PlanningMaterial, AcceptanceMaterial } from '../../shared/workbench/version-material'
import { eraseRpcMethods } from '../runtime/rpc/core'
import { WORKBENCH_MATERIAL_METHODS } from '../runtime/rpc/methods/workbench-materials'
import type { VersionMaterialResult } from '../../shared/workbench/version-material-request'
import { createVersionMaterialPort } from '../../shared/workbench/version-material-client'

import { executeVersionMaterial } from './version-material-runtime'
import { registerVersionMaterialRelay } from '../../relay/workbench/version-material-handler'
import { setSshActiveMultiplexerResolver } from '../ssh/ssh-target-registry'
import type { SshChannelMultiplexer } from '../ssh/ssh-channel-multiplexer'
import type { MethodHandler } from '../../relay/dispatcher'
import { createVersionMaterialWorkspace } from './version-material-workspace'
const createVersionMaterialService = (host: VersionMaterialHost) =>
  createService(host, createVersionMaterialWorkspace)

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
        {
          id: 'plan',
          repoId: 'repo',
          path: planning,
          hostId: 'local',
          isArchived: false,
          isMainWorktree: false
        },
        {
          id: 'acceptance',
          repoId: 'repo',
          path: acceptance,
          hostId: 'local',
          isArchived: false,
          isMainWorktree: false
        }
      ]
    }
  })

  afterEach(async () => {
    setSshActiveMultiplexerResolver(null)
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

  it('rejects unknown hosts, ambiguous, foreign and stale branch identities before writing', async () => {
    const save = (service = createVersionMaterialService(host), overrides = {}) =>
      service.save({
        ...scope,
        version: 'v0.5',
        expectedRevision: null,
        document: plan,
        ...overrides
      })
    await expect(save(undefined, { hostId: 'ssh:other' })).rejects.toMatchObject({
      code: 'invalid-scope'
    })
    await expect(save(undefined, { worktreeId: 'acceptance' })).rejects.toMatchObject({
      code: 'wrong-branch'
    })
    const repos = host.listRepos()
    const trees = await host.listWorktrees(scope)
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
      return result
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
        if (++checks === 3) {
          git(planning, 'checkout', '--detach')
        }
        return host.listWorktrees(scope)
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
  it.each(['local', 'ssh:server'])(
    'migrates through the registered RPC and host transaction on %s',
    async (hostId) => {
      const handlers = new Map<string, MethodHandler>()
      registerVersionMaterialRelay({
        onRequest: (name, handler) => {
          handlers.set(name, handler)
        }
      })
      const request = vi.fn(async (name: string, params: Record<string, unknown>) =>
        handlers.get(name)!(params, {} as never)
      )
      setSshActiveMultiplexerResolver((id) =>
        id === 'server' ? ({ request } as unknown as SshChannelMultiplexer) : undefined
      )
      const trees = await host.listWorktrees(scope)
      const runtime = {
        listRepos: () => [{ id: 'repo', path: repo, kind: 'git', executionHostId: hostId }],
        showManagedWorktree: async (selector: string) => {
          expect(selector).toBe('id:plan')
          return { ...trees.find((tree) => tree.id === 'plan')!, hostId }
        }
      }
      const methods = eraseRpcMethods(WORKBENCH_MATERIAL_METHODS)
      const port = createVersionMaterialPort({ ...scope, hostId }, async ({ method, params }) => {
        const registered = methods.find((entry) => entry.name === method)!
        return (await registered.handler(registered.params!.parse(params), {
          runtime
        } as never)) as VersionMaterialResult<unknown>
      })
      const directory = join(planning, '.bw/planning/v0.5')
      await mkdir(directory, { recursive: true })
      const file = join(directory, 'data.json')
      const original = JSON.stringify({
        schema_version: 2,
        version: 'v0.5',
        plan: { goals: [{ id: 'one', title: 'Existing commitment' }], tasks: [] },
        summary: { progress: '', risks: '' }
      })
      await writeFile(file, original)
      const preview = await port.previewMigration('v0.5', 'new-cycle')
      expect(await readFile(file, 'utf8')).toBe(original)
      expect(await readdir(directory)).toEqual(['data.json'])
      await expect(
        port.migrate('v0.5', 'new-cycle', `sha256:${'0'.repeat(64)}`)
      ).rejects.toMatchObject({ code: 'revision-conflict' })
      const migrated = await port.migrate('v0.5', 'new-cycle', preview.sourceRevision)
      expect(migrated.snapshot.document).toEqual(preview.plan)
      expect(await readFile(join(directory, preview.backupName), 'utf8')).toBe(original)
      expect((await port.read('v0.5'))?.document).toEqual(preview.plan)
      if (hostId === 'ssh:server') {
        expect(request).toHaveBeenCalledWith(
          'workbench.materials.execute',
          expect.objectContaining({ operation: 'previewMigration' })
        )
        expect(request).toHaveBeenCalledWith(
          'workbench.materials.execute',
          expect.objectContaining({ operation: 'migrate' })
        )
      }
    }
  )
  it('bound flow tree fences version and purpose: only its bound version reads/writes (G2 P3a)', async () => {
    const boundDir = join(directory, 'plan-v09')
    git(repo, 'worktree', 'add', '-b', 'bw/v0.9/plan', boundDir)
    const boundHost: VersionMaterialHost = {
      listRepos: () => [{ id: 'repo', path: repo, kind: 'git' }],
      listWorktrees: async () => [
        {
          id: 'bound',
          repoId: 'repo',
          path: boundDir,
          hostId: 'local',
          isArchived: false,
          isMainWorktree: false,
          workbenchVersionBinding: { schema: 1, version: 'v0.9', workflow: 'plan' }
        }
      ]
    }
    const service = createVersionMaterialService(boundHost)
    const boundScope = {
      repoId: 'repo',
      worktreeId: 'bound',
      hostId: 'local',
      workflow: 'plan' as const
    }
    // 跨版读写一律拒绝：v0.9 的树不能当 v0.5 用（客户端改版本也拒）。
    await expect(service.read({ ...boundScope, version: 'v0.5' })).rejects.toMatchObject({
      code: 'cross-version'
    })
    await expect(
      service.save({ ...boundScope, version: 'v0.5', expectedRevision: null, document: plan })
    ).rejects.toMatchObject({ code: 'cross-version' })
    // 用途不混：绑定计划树不接受验收范围。
    await expect(service.list({ ...boundScope, workflow: 'acceptance' })).rejects.toMatchObject({
      code: 'invalid-scope'
    })
    // 绑定版本正常读写；list 只呈现绑定版本（检出含其他版本目录也不外溢）。
    const document = { ...plan, version: 'v0.9' }
    const saved = await service.save({
      ...boundScope,
      version: 'v0.9',
      expectedRevision: null,
      document
    })
    expect(saved.document).toEqual(document)
    await mkdir(join(boundDir, '.bw/planning/v0.5'), { recursive: true })
    await writeFile(join(boundDir, '.bw/planning/v0.5/data.json'), JSON.stringify(plan))
    expect((await service.list(boundScope)).map((candidate) => candidate.version)).toEqual(['v0.9'])
    expect((await service.read({ ...boundScope, version: 'v0.9' }))?.document).toEqual(document)
  })
  it('uses the native SSH channel and the same host transaction, preserving conflicts and offline state', async () => {
    const handlers = new Map<string, MethodHandler>()
    registerVersionMaterialRelay({
      onRequest: (method, handler) => {
        handlers.set(method, handler)
      }
    })
    const request = vi.fn(async (method: string, params: Record<string, unknown>) =>
      handlers.get(method)!(params, {} as never)
    )
    const resolve = vi.fn((connectionId: string) =>
      connectionId === 'server' ? ({ request } as unknown as SshChannelMultiplexer) : undefined
    )
    setSshActiveMultiplexerResolver(resolve)
    const remoteScope = { ...scope, hostId: 'ssh:server' }
    const trees = await host.listWorktrees(scope)
    const remote = createService(
      {
        listRepos: () => [{ id: 'repo', path: repo, kind: 'git', executionHostId: 'ssh:server' }],
        listWorktrees: async () => trees.map((tree) => ({ ...tree, hostId: 'ssh:server' }))
      },
      executeVersionMaterial
    )
    const saved = await remote.save({
      ...remoteScope,
      version: 'v0.5',
      expectedRevision: null,
      document: plan
    })
    expect(resolve).toHaveBeenCalledWith('server')
    expect(request).toHaveBeenCalledWith(
      'workbench.materials.execute',
      expect.objectContaining({
        target: { repoPath: repo, worktreePath: planning },
        operation: 'save'
      })
    )
    expect(await remote.read({ ...remoteScope, version: 'v0.5' })).toEqual(saved)
    await expect(
      remote.save({ ...remoteScope, version: 'v0.5', expectedRevision: null, document: plan })
    ).rejects.toMatchObject({ code: 'revision-conflict', currentRevision: saved.revision })
    git(planning, 'checkout', '--detach')
    await expect(
      remote.save({
        ...remoteScope,
        version: 'v0.5',
        expectedRevision: saved.revision,
        document: plan
      })
    ).rejects.toMatchObject({ code: 'wrong-branch' })
    setSshActiveMultiplexerResolver(() => undefined)
    await expect(remote.read({ ...remoteScope, version: 'v0.5' })).rejects.toMatchObject({
      code: 'host-unavailable'
    })
    expect(
      JSON.parse(await readFile(join(planning, '.bw/planning/v0.5/data.json'), 'utf8'))
    ).toEqual(plan)
  })
})
