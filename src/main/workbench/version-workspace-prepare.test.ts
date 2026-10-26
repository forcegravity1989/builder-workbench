import { describe, expect, it } from 'vitest'
import type { Worktree } from '../../shared/worktree/types'
import type { CreateWorktreeResult } from '../../shared/worktree/create-types'
import type { RuntimeManagedWorktreeCreateArgs } from '../runtime/runtime-managed-worktree-create-types'
import { normalizeStoredWorkbenchVersionBinding } from '../../shared/workbench/version-binding'
import type { VersionHistoryCatalog } from '../../shared/workbench/version-history'
import type { PlanningMaterial } from '../../shared/workbench/version-material'
import type { VersionMaterialInitialize } from '../../shared/workbench/version-material-request'
import { prepareFailed } from '../../renderer/src/workbench/version-workspace-prepare-report'
import { nativeWorkbenchWorkspaceHost } from './workspace-resolver'
import {
  createVersionWorkspacePrepareService,
  type VersionWorkspacePrepareRuntime
} from './version-workspace-prepare'

/** 环 4 数据协议看护：版本准备的宿主端去重、失败恢复与创建结果核对（G2 P2，J2 判据）。 */

const repo = {
  id: 'repo-1',
  path: '/repo',
  kind: 'git',
  connectionId: null,
  executionHostId: null,
  worktreeBaseRef: null,
  worktreeBasePath: null,
  gitRemoteIdentity: null
}

const scope = { repoId: 'repo-1', hostId: 'local' }

type FakeTree = {
  id: string
  path: string
  branch: string
  hostId: string
  instanceId: string
  isArchived: boolean
  isMainWorktree: boolean
  binding: unknown
}

function createFakeEnvironment(
  options: {
    failAcceptanceCreate?: boolean
    uniquifyPlan?: boolean
    externalHolderBranch?: string
    history?: VersionHistoryCatalog
    historyError?: string
  } = {}
) {
  const registry = new Map<string, FakeTree>()
  const external = new Map<string, FakeTree>()
  if (options.externalHolderBranch) {
    external.set('ext-1', {
      id: 'repo-1::/external/tree',
      path: '/external/tree',
      branch: `refs/heads/${options.externalHolderBranch}`,
      hostId: 'local',
      instanceId: 'inst-ext',
      isArchived: false,
      isMainWorktree: false,
      binding: null
    })
  }
  const materialDocs = new Map<string, { revision: string; document: PlanningMaterial }>()
  const calls = {
    create: 0,
    remove: 0,
    removeOptions: [] as unknown[],
    initializeCreated: 0,
    historyReads: 0
  }
  let seq = 0
  const inFlight = new Map<string, Promise<unknown>>()

  const asWorktree = (tree: FakeTree): Worktree =>
    ({
      id: tree.id,
      repoId: 'repo-1',
      path: tree.path,
      branch: tree.branch,
      hostId: tree.hostId,
      isArchived: tree.isArchived,
      isMainWorktree: tree.isMainWorktree,
      instanceId: tree.instanceId,
      identity: {
        key: `wt2:${encodeURIComponent(tree.hostId)}:${tree.instanceId}`,
        executionHostId: tree.hostId,
        instanceId: tree.instanceId
      },
      workbenchVersionBinding: normalizeStoredWorkbenchVersionBinding(tree.binding)
    }) as Worktree

  const findById = (id: string): FakeTree | undefined => registry.get(id)

  const runtime: VersionWorkspacePrepareRuntime = {
    listRepos: () => [repo] as never,
    showManagedWorktree: async (selector: string) => {
      if (selector.startsWith('identity:')) {
        const instanceId = decodeURIComponent(selector.slice('identity:'.length)).split(':')[2]
        for (const tree of registry.values()) {
          if (tree.instanceId === instanceId) {
            return asWorktree(tree)
          }
        }
        throw new Error('selector_not_found')
      }
      const tree = findById(selector.replace(/^id:/, ''))
      if (!tree) {
        throw new Error('selector_not_found')
      }
      return asWorktree(tree)
    },
    updateManagedWorktreeMeta: async (selector: string, updates: Record<string, unknown>) => {
      let target: FakeTree | undefined
      if (selector.startsWith('identity:')) {
        const instanceId = decodeURIComponent(selector).split(':').pop()
        target = [...registry.values()].find((tree) => tree.instanceId === instanceId)
      } else {
        target = findById(selector.replace(/^id:/, ''))
      }
      if (!target) {
        throw new Error('selector_not_found')
      }
      target.binding = updates.workbenchVersionBinding
      return asWorktree(target)
    },
    listManagedWorktrees: async () =>
      ({ worktrees: [...registry.values()].map(asWorktree) }) as never,
    listDetectedManagedWorktrees: async () =>
      ({
        worktrees: [...registry.values(), ...external.values()].map(asWorktree)
      }) as never,
    searchRepoRefs: async () => ({ refs: [], truncated: false }),
    dedupeWorktreeCreate: <T>(
      repoSelector: string,
      clientMutationId: string | undefined,
      run: () => Promise<T>
    ): Promise<T> => {
      // 忠实映射原生语义：in-flight 同键收敛为同一 promise，失败立即释放。
      if (!clientMutationId) {
        return run()
      }
      const key = `${repoSelector}\0${clientMutationId}`
      const existing = inFlight.get(key)
      if (existing) {
        return existing as Promise<T>
      }
      const created = run().then(
        (value) => {
          setTimeout(() => inFlight.delete(key), 0)
          return value
        },
        (error) => {
          inFlight.delete(key)
          throw error
        }
      )
      inFlight.set(key, created)
      return created
    },
    createManagedWorktree: async (args: RuntimeManagedWorktreeCreateArgs) => {
      calls.create += 1
      // 让并发调用在 in-flight 窗口内重叠，命中宿主端去重。
      await new Promise((resolve) => setTimeout(resolve, 5))
      const branch = args.branchNameOverride!
      if (options.failAcceptanceCreate && branch.endsWith('/acceptance')) {
        throw new Error('acceptance create failed')
      }
      const finalBranch = options.uniquifyPlan && branch.endsWith('/plan') ? `${branch}-2` : branch
      const tree: FakeTree = {
        id: `repo-1::/repo/trees/${args.name}`,
        path: `/repo/trees/${args.name}`,
        branch: `refs/heads/${finalBranch}`,
        hostId: 'local',
        instanceId: `inst-${++seq}`,
        isArchived: false,
        isMainWorktree: false,
        binding: null
      }
      registry.set(tree.id, tree)
      return { worktree: asWorktree(tree) } as CreateWorktreeResult
    },
    removeManagedWorktree: async (selector: string, removeOptions?: unknown) => {
      calls.remove += 1
      calls.removeOptions.push(removeOptions)
      registry.delete(selector.replace(/^id:/, ''))
      return { removed: true }
    }
  }

  const materialExecutor = ((_target: unknown, _reauthorize: unknown) =>
    ({
      read: async (input: { version: string }) => materialDocs.get(input.version) ?? null,
      initializeEmptyPlan: async (input: VersionMaterialInitialize) => {
        const existing = materialDocs.get(input.version)
        if (existing) {
          return { created: false, revision: existing.revision }
        }
        const revision = `sha256:${'a'.repeat(64)}`
        materialDocs.set(input.version, {
          revision,
          document: {
            schema_version: 3,
            version: input.version,
            cycleId: input.cycleId,
            summary: {
              progress: '',
              risks: '',
              ...(input.progressSource ? { progressSource: input.progressSource } : {})
            },
            goals: [],
            tasks: []
          }
        })
        calls.initializeCreated += 1
        return { created: true, revision }
      }
    }) as never) as never

  const service = createVersionWorkspacePrepareService(
    nativeWorkbenchWorkspaceHost(runtime),
    runtime,
    materialExecutor,
    {
      list: async () => {
        calls.historyReads++
        if (options.historyError) {
          throw new Error(options.historyError)
        }
        return options.history ?? { records: [], problems: [] }
      }
    }
  )
  return { service, registry, materialDocs, calls, runtime }
}

describe('versionWorkspace prepare', () => {
  it('converges concurrent double-clicks host-side and rediscovers existing bindings without creating', async () => {
    const source = {
      version: 'v0.7',
      cycleId: 'cycle-07',
      sourceCommit: 'b'.repeat(40),
      revision: `sha256:${'b'.repeat(64)}`
    }
    const options = {
      history: {
        records: [
          { ...source, workflow: 'acceptance' as const, committedAt: '2026-10-01T00:00:00Z' }
        ],
        problems: []
      },
      historyError: undefined as string | undefined
    }
    const env = createFakeEnvironment(options)
    // 双击/两窗口并发：同一 tick 发起两次 prepare，宿主端 dedupe 收敛为每用途一次创建。
    const [first, second] = await Promise.all([
      env.service.prepare({ ...scope, version: 'v0.8' }),
      env.service.prepare({ ...scope, version: 'v0.8' })
    ])
    expect(env.calls.create).toBe(2)
    expect(env.registry.size).toBe(2)
    for (const result of [first, second]) {
      expect(result.problems).toEqual([])
      expect(result.steps.map((step) => [step.workflow, step.state])).toEqual([
        ['plan', 'created'],
        ['acceptance', 'created']
      ])
    }
    // 两个调用方拿到同一批树；绑定带创建结果 instanceId 围栏；空计划只初始化一次。
    expect(first.steps.map((step) => step.worktreeId)).toEqual(
      second.steps.map((step) => step.worktreeId)
    )
    const planStep = first.steps[0]
    expect(planStep.instanceId).toBeTruthy()
    expect(planStep.material?.state).toBe('initialized')
    expect(env.calls.initializeCreated).toBe(1)
    const planTree = env.registry.get(planStep.worktreeId!)!
    expect(planTree.binding).toEqual({ schema: 1, version: 'v0.8', workflow: 'plan' })
    expect(planTree.instanceId).toBe(planStep.instanceId)
    expect(env.materialDocs.get('v0.8')?.document.summary.progressSource).toEqual(source)

    // 重入（重启后补齐语义）：全部 existing，零创建，材料不覆盖。
    const revisionBefore = env.materialDocs.get('v0.8')
    const historyReadsBefore = env.calls.historyReads
    options.historyError = 'new history is unavailable'
    const reentry = await env.service.prepare({ ...scope, version: 'v0.8' })
    expect(env.calls.create).toBe(2)
    expect(reentry.steps.map((step) => step.state)).toEqual(['existing', 'existing'])
    expect(reentry.steps[0].material?.state).toBe('existing')
    expect(env.materialDocs.get('v0.8')).toBe(revisionBefore)
    expect(env.calls.historyReads).toBe(historyReadsBefore)
    expect(reentry.problems).toEqual([])
  })

  it('keeps succeeded steps on failure, completes on retry, and never binds a mismatched create', async () => {
    // J2：中断第二棵（验收）准备 → 第一棵全保留；重试按真实登记补齐，恰两棵。
    const options = { failAcceptanceCreate: true }
    const env = createFakeEnvironment(options)
    const failed = await env.service.prepare({ ...scope, version: 'v0.8' })
    expect(failed.steps.map((step) => [step.workflow, step.state])).toEqual([
      ['plan', 'created'],
      ['acceptance', 'failed']
    ])
    expect(failed.problems).toEqual([
      { workflow: 'acceptance', code: 'prepare-failed', message: 'acceptance create failed' }
    ])
    expect(prepareFailed(failed)).toBe(true)
    expect(env.registry.size).toBe(1)
    const planRevision = env.materialDocs.get('v0.8')
    expect(planRevision).toBeTruthy()

    // 失败原因排除后重试：计划树复用（零重建、材料不覆盖），验收补齐。
    options.failAcceptanceCreate = false
    const retried = await env.service.prepare({ ...scope, version: 'v0.8' })
    expect(retried.problems).toEqual([])
    expect(retried.steps.map((step) => step.state)).toEqual(['existing', 'created'])
    expect(env.registry.size).toBe(2)
    // 重试没有重建计划树、没有覆盖材料。
    expect(retried.steps[0].material?.state).toBe('existing')
    expect(env.materialDocs.get('v0.8')).toBe(planRevision)

    // 创建结果核对：原生 uniquify 分支 → 不绑定、不初始化、不标成功；
    // 误建树沿原生删除链默认口径清理（无 force/豁免）；验收步不受影响。
    const mismatch = createFakeEnvironment({ uniquifyPlan: true })
    const result = await mismatch.service.prepare({ ...scope, version: 'v0.8' })
    const planStep = result.steps[0]
    expect(planStep.state).toBe('failed')
    expect(result.problems[0]).toMatchObject({
      workflow: 'plan',
      code: 'create-branch-mismatch'
    })
    expect(mismatch.calls.remove).toBe(1)
    expect(mismatch.calls.removeOptions[0]).toEqual({ hostId: 'local' })
    // 误建的计划树没有被绑定；验收树正常绑定。
    expect(
      [...mismatch.registry.values()].some(
        (tree) => normalizeStoredWorkbenchVersionBinding(tree.binding)?.workflow === 'plan'
      )
    ).toBe(false)
    expect(result.steps[1].state).toBe('created')

    // 分支被不能证明归属的树占用 → 拒绝且不创建；版本名不能组成合法分支 → 整体拒绝。
    const occupied = createFakeEnvironment({ externalHolderBranch: 'bw/v0.9/plan' })
    const occupiedResult = await occupied.service.prepare({ ...scope, version: 'v0.9' })
    expect(occupiedResult.problems[0]).toMatchObject({
      workflow: 'plan',
      code: 'branch-occupied'
    })
    expect(occupied.calls.create).toBe(1) // 只创建了验收树
    await expect(occupied.service.prepare({ ...scope, version: 'v0 9' })).rejects.toMatchObject({
      code: 'invalid-version'
    })

    // 默认回顾读取失败仍初始化空计划；真实诊断保留，不借旧验收、不卡住会话准备。
    const unreadable = createFakeEnvironment({ historyError: 'fixed history unreadable' })
    const unreadableResult = await unreadable.service.prepare({ ...scope, version: 'v0.8' })
    expect(unreadableResult.steps.map((step) => step.state)).toEqual(['created', 'created'])
    expect(unreadableResult.steps[0].material?.state).toBe('initialized')
    expect(unreadable.materialDocs.get('v0.8')?.document.summary.progressSource).toBeUndefined()
    expect(unreadableResult.problems).toEqual([
      { workflow: 'plan', code: 'prior-source-unavailable', message: 'fixed history unreadable' }
    ])
    expect(prepareFailed(unreadableResult)).toBe(false)
    expect(
      prepareFailed({
        ...unreadableResult,
        problems: [
          ...unreadableResult.problems,
          { workflow: 'plan', code: 'initialize-failed', message: 'cannot initialize plan' }
        ]
      })
    ).toBe(true)
  })
})
