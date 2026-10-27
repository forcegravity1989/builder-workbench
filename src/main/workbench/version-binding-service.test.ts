import { describe, expect, it } from 'vitest'
import type { Worktree } from '../../shared/worktree/types'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import {
  fillDefaultWorktreeMetaFields,
  omitDefaultWorktreeMetaFields
} from '../../shared/worktree/meta-persisted-defaults'
import { normalizeStoredWorkbenchVersionBinding } from '../../shared/workbench/version-binding'
import type { TaskSourceContext } from '../../shared/task-source-context'
import { mergeWorktreeMetaForWrite } from '../persistence/loading-store/worktree-meta-write-normalization'
import { mergeWorktree } from '../ipc/worktree-metadata-merge'
import { nativeVersionBindingService, type VersionBindingRuntime } from './version-binding-service'

/** 环 4 数据协议看护：绑定的 owner/实例校验与读回确认（G2 P1a，#383）。 */

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

const scope = {
  repoId: 'repo-1',
  worktreeId: 'repo-1::/repo/trees/v07-plan',
  hostId: 'local',
  projectId: 'proj-1',
  instanceId: 'inst-1'
}

const binding = { schema: 1 as const, version: 'v0.7', workflow: 'plan' as const }
const taskSource: TaskSourceContext = {
  kind: 'task-source',
  provider: 'github',
  projectId: 'proj-1',
  repoId: 'repo-1',
  hostId: 'local'
}
const issueBinding = { ...binding, workflow: 'issue' as const, goalId: 'G1', taskSource }
const linkedWorkItem = {
  provider: 'github' as const,
  type: 'issue' as const,
  number: 439,
  title: 'Issue A',
  url: 'https://github.com/example/repo/issues/439',
  repoId: 'repo-1'
}

function createFakeRuntime(
  options: {
    dropBindingOnWrite?: boolean
    dropLinkedOnWrite?: boolean
    archived?: boolean
    unregistered?: boolean
  } = {}
) {
  const stored: Partial<WorktreeMeta> = {}
  const state = { writes: 0, lastSelector: '' }
  const worktree = () =>
    ({
      id: scope.worktreeId,
      repoId: 'repo-1',
      path: '/repo/trees/v07-plan',
      branch: 'refs/heads/issue-439',
      displayName:
        stored.displayNameIsPinned === false ? 'issue-439' : (stored.displayName ?? 'issue-439'),
      displayNameMode: stored.displayNameIsPinned === true ? 'fixed' : 'automatic',
      hostId: 'local',
      isArchived: options.archived ?? false,
      isMainWorktree: false,
      instanceId: 'inst-1',
      projectId: 'proj-1',
      identity: { key: 'wt2:local:inst-1', executionHostId: 'local', instanceId: 'inst-1' },
      workbenchVersionBinding: normalizeStoredWorkbenchVersionBinding(
        stored.workbenchVersionBinding
      ),
      linkedWorkItem: stored.linkedWorkItem,
      linkedTaskSourceContext: stored.linkedTaskSourceContext
    }) as Worktree
  const runtime: VersionBindingRuntime = {
    listRepos: () => (options.unregistered ? [] : [repo]) as never,
    showManagedWorktree: async () => {
      if (options.unregistered) {
        throw new Error('worktree not registered')
      }
      return worktree()
    },
    updateManagedWorktreeMeta: async (selector: string, updates: Partial<WorktreeMeta>) => {
      state.writes += 1
      state.lastSelector = selector
      if (updates.displayNameIsPinned !== undefined) {
        stored.displayNameIsPinned = updates.displayNameIsPinned
      }
      if (!options.dropBindingOnWrite) {
        stored.workbenchVersionBinding = updates.workbenchVersionBinding
      }
      if (!options.dropLinkedOnWrite && updates.linkedWorkItem) {
        stored.linkedWorkItem = updates.linkedWorkItem
        stored.linkedTaskSourceContext = updates.linkedTaskSourceContext
      }
      return worktree()
    }
  }
  return { runtime, state, stored }
}

describe('nativeVersionBindingService', () => {
  it('writes only for the registered owner instance and reads the binding back', async () => {
    const { runtime, state, stored } = createFakeRuntime()
    const service = nativeVersionBindingService(runtime)

    // 未绑定读回 null（Unknown，不是绿）。
    expect(await service.read(scope)).toBeNull()

    // Issue 改绑与原生关联同次保存；解绑只清版本归属，不清原生关联。
    const beforeIssueBind = state.writes
    await service.set({ ...scope, binding: issueBinding, linkedWorkItem })
    expect(state.writes).toBe(beforeIssueBind + 1)
    expect(stored.linkedWorkItem).toEqual(linkedWorkItem)
    expect(stored.linkedTaskSourceContext).toEqual({
      ...taskSource,
      projectHostSetupId: null,
      providerIdentity: null,
      accountLabel: null
    })
    const issueB = {
      ...linkedWorkItem,
      number: 440,
      title: 'Issue B',
      url: 'https://github.com/example/repo/issues/440'
    }
    await expect(
      service.set({
        ...scope,
        instanceId: 'inst-stale',
        binding: issueBinding,
        linkedWorkItem: issueB
      })
    ).rejects.toMatchObject({ code: 'stale-instance' })
    expect(stored.linkedWorkItem).toEqual(linkedWorkItem)
    expect(state.writes).toBe(beforeIssueBind + 1)
    stored.displayName = linkedWorkItem.title
    stored.displayNameIsPinned = true
    await service.set({ ...scope, binding: issueBinding, linkedWorkItem: issueB })
    expect(stored.linkedWorkItem).toEqual(issueB)
    expect(stored.displayNameIsPinned).toBe(true)
    expect(stored.displayName).toBe(linkedWorkItem.title)
    expect(state.writes).toBe(beforeIssueBind + 2)
    await service.set({ ...scope, binding: null })
    expect(stored.linkedWorkItem).toEqual(issueB)

    // owner 验证后写入 identity 选择器（实例更换即失败），读回一致才返回。
    expect(await service.set({ ...scope, binding })).toEqual(binding)
    expect(state.writes).toBe(beforeIssueBind + 4)
    expect(state.lastSelector).toBe('identity:wt2:local:inst-1')
    expect(await service.read(scope)).toEqual(binding)

    const custom = createFakeRuntime()
    custom.stored.linkedWorkItem = linkedWorkItem
    custom.stored.displayName = 'My custom workspace'
    custom.stored.displayNameIsPinned = true
    await nativeVersionBindingService(custom.runtime).set({
      ...scope,
      binding: issueBinding,
      linkedWorkItem: issueB
    })
    expect(custom.stored.displayName).toBe('My custom workspace')
    expect(custom.stored.displayNameIsPinned).toBe(true)

    // P1c 重启读回：走真实持久化链独立 round-trip（写合并 → 序列化压缩 →
    // 载入补默认 → 投影），绑定与「重启」前一致，不需要 BW 侧任何副本。
    const persisted = mergeWorktreeMetaForWrite(undefined, { workbenchVersionBinding: binding })
    const reloadedMeta = JSON.parse(JSON.stringify(omitDefaultWorktreeMetaFields(persisted)))
    fillDefaultWorktreeMetaFields(reloadedMeta)
    const projected = mergeWorktree(
      'repo-1',
      {
        path: '/repo/trees/v07-plan',
        head: 'abc123',
        branch: 'refs/heads/bw/v07-plan',
        isBare: false,
        isMainWorktree: false
      },
      reloadedMeta
    )
    expect(projected.workbenchVersionBinding).toEqual(binding)

    // 清除：null 写入后读回未绑定。
    expect(await service.set({ ...scope, binding: null })).toBeNull()
    expect(await service.read(scope)).toBeNull()

    // 旧实例/他项目不能冒用：登记实例已更换或项目不符时拒绝，且不发生写入。
    const writesBefore = state.writes
    await expect(
      service.set({ ...scope, instanceId: 'inst-stale', binding })
    ).rejects.toMatchObject({ code: 'stale-instance' })
    await expect(service.read({ ...scope, projectId: 'proj-other' })).rejects.toMatchObject({
      code: 'invalid-scope'
    })
    expect(state.writes).toBe(writesBefore)
  })

  it('never fakes success on a dropped write-back or revoked authorization', async () => {
    // 写入被对端丢弃（旧宿主剥字段/并发覆盖）：读回不一致 ⇒ 报未确认，不虚报成功。
    const dropping = createFakeRuntime({ dropBindingOnWrite: true })
    await expect(
      nativeVersionBindingService(dropping.runtime).set({ ...scope, binding })
    ).rejects.toMatchObject({ code: 'binding-unconfirmed' })
    const droppingLinked = createFakeRuntime({ dropLinkedOnWrite: true })
    await expect(
      nativeVersionBindingService(droppingLinked.runtime).set({
        ...scope,
        binding: issueBinding,
        linkedWorkItem
      })
    ).rejects.toMatchObject({ code: 'binding-unconfirmed' })

    // 权限撤销/登记消失（归档、注销注册行）：resolver 拒绝，写入根本不会发生。
    for (const options of [{ archived: true }, { unregistered: true }]) {
      const revoked = createFakeRuntime(options)
      await expect(
        nativeVersionBindingService(revoked.runtime).set({ ...scope, binding })
      ).rejects.toBeTruthy()
      expect(revoked.state.writes).toBe(0)
    }
  })
})
