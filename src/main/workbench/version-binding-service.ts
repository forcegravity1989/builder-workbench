import type { ExecutionHostId } from '../../shared/execution-host'
import type { Worktree } from '../../shared/worktree/types'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import { areWorkspaceLinkedItemsEqual } from '../../shared/workspace-linked-item'
import { areTaskSourceContextsEqual } from '../../shared/task-source-context'
import {
  VersionBindingScopeSchema,
  VersionBindingSetSchema,
  WorkbenchVersionBindingSchema,
  areWorkbenchVersionBindingsEqual,
  normalizeStoredWorkbenchVersionBinding,
  type VersionBindingScope,
  type VersionBindingSetRequest,
  type WorkbenchVersionBinding
} from '../../shared/workbench/version-binding'
import {
  createWorkbenchWorkspaceResolver,
  nativeWorkbenchWorkspaceHost,
  type WorkbenchWorkspaceHost
} from './workspace-resolver'
import { WorkspaceScopeError } from './workspace-scope-error'

/** The native surfaces this thin helper composes; paths never come from callers. */
export type VersionBindingRuntime = {
  listRepos: WorkbenchWorkspaceHost['listRepos']
  showManagedWorktree(selector: string, requiredHostId?: ExecutionHostId): Promise<Worktree>
  updateManagedWorktreeMeta(selector: string, updates: Partial<WorktreeMeta>): Promise<Worktree>
}

/**
 * BW 薄 helper：版本绑定的验证读写（接线要求见
 * docs/05-features/version-workspace/design.md，#383）。
 *
 * 用原生身份（project/repo/host/runtimeOwner/instanceId）在 owner runtime 上定位
 * 实例；owner 验证沿 workspace resolver，写入走 identity 选择器（实例更换即失败），
 * 保存后读回确认一致才返回。绑定是原生登记的附属 metadata：随登记删除消失，
 * 本服务不落任何 BW 侧副本。
 */
export function createVersionBindingService(
  host: WorkbenchWorkspaceHost,
  runtime: VersionBindingRuntime
) {
  const resolver = createWorkbenchWorkspaceResolver(host)

  async function locate(scope: VersionBindingScope) {
    const { target, reauthorize } = await resolver.resolve(scope)
    const worktree = await runtime.showManagedWorktree(`id:${scope.worktreeId}`, target.hostId)
    // 原生身份核对以 owner 登记为准，不采纳客户端自述；不符即拒绝，不降级。
    if (scope.projectId !== undefined && worktree.projectId !== scope.projectId) {
      throw new WorkspaceScopeError('invalid-scope', '工作树不属于该项目，绑定被拒绝')
    }
    if (scope.instanceId !== undefined && worktree.instanceId !== scope.instanceId) {
      throw new WorkspaceScopeError('stale-instance', '工作树实例已更换，请重新定位绑定对象')
    }
    return { worktree, reauthorize }
  }

  return {
    async read(input: VersionBindingScope): Promise<WorkbenchVersionBinding | null> {
      const scope = VersionBindingScopeSchema.parse(input)
      const { worktree } = await locate(scope)
      return normalizeStoredWorkbenchVersionBinding(worktree.workbenchVersionBinding)
    },
    async set(input: VersionBindingSetRequest): Promise<WorkbenchVersionBinding | null> {
      const request = VersionBindingSetSchema.parse(input)
      const binding =
        request.binding === null ? null : WorkbenchVersionBindingSchema.parse(request.binding)
      const { worktree, reauthorize } = await locate(request)
      if (!worktree.identity?.key) {
        throw new WorkspaceScopeError('workspace-unavailable', '工作树身份不可用，请刷新后重试')
      }
      await reauthorize()
      const updated = await runtime.updateManagedWorktreeMeta(`identity:${worktree.identity.key}`, {
        workbenchVersionBinding: binding,
        ...(request.linkedWorkItem
          ? { linkedWorkItem: request.linkedWorkItem, linkedTaskSourceContext: binding?.taskSource }
          : {})
      })
      // 读回确认再返回：登记投影与请求不一致（旧宿主丢字段、并发覆盖）⇒ 不算已保存。
      const readBack = normalizeStoredWorkbenchVersionBinding(updated.workbenchVersionBinding)
      if (
        !areWorkbenchVersionBindingsEqual(readBack, binding) ||
        (request.linkedWorkItem &&
          (!areWorkspaceLinkedItemsEqual(updated.linkedWorkItem, request.linkedWorkItem) ||
            !areTaskSourceContextsEqual(updated.linkedTaskSourceContext, binding?.taskSource)))
      ) {
        throw new WorkspaceScopeError('binding-unconfirmed', '绑定读回不一致，未保存；请刷新后重试')
      }
      return readBack
    }
  }
}

/** A BW composition adapter over Orca's existing public inventory and metadata APIs. */
export function nativeVersionBindingService(runtime: VersionBindingRuntime) {
  return createVersionBindingService(nativeWorkbenchWorkspaceHost(runtime), runtime)
}
