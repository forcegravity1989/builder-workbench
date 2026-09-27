import { useAppStore } from '@/store'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { resolveExactWorktreeRoute, routeForOwner } from '@/lib/worktree-owner-route'
import {
  getRepoExecutionHostId,
  parseExecutionHostId,
  toRuntimeExecutionHostId
} from '../../../../shared/execution-host'
import type { CreateWorktreeResult } from '../../../../shared/worktree/create-types'
import type { Worktree } from '../../../../shared/worktree/types'
import type { CycleScope } from './ports'

export type NativeWorkspaceScope = Omit<CycleScope, 'workflow'>
export const nativeWorkspaceScopeKey = (scope: NativeWorkspaceScope) =>
  JSON.stringify([
    scope.projectId,
    scope.repoId,
    scope.hostId,
    scope.runtimeOwnerEnvironmentId ?? ''
  ])
export function nativeWorkspaceRuntimeTarget(scope: NativeWorkspaceScope) {
  const route = routeForOwner({
    hostId: scope.hostId,
    runtimeOwnerEnvironmentId: scope.runtimeOwnerEnvironmentId
  })
  if (!route) {
    throw new Error('工作树宿主身份不可用')
  }
  return route.runtimeEnvironmentId
    ? { kind: 'environment' as const, environmentId: route.runtimeEnvironmentId }
    : { kind: 'local' as const }
}
export function nativeWorkspaceScope(worktree: Worktree): NativeWorkspaceScope {
  const state = useAppStore.getState()
  const declaredHost = parseExecutionHostId(worktree.hostId ?? worktree.identity?.executionHostId)
  const repos = state.repos.filter(
    (repo) =>
      repo.id === worktree.repoId &&
      (!declaredHost || getRepoExecutionHostId(repo) === declaredHost.id)
  )
  const host =
    declaredHost ??
    (repos.length === 1 ? parseExecutionHostId(getRepoExecutionHostId(repos[0])) : null)
  if (!host) {
    throw new Error('无法确定工作树所属宿主')
  }
  const route = resolveExactWorktreeRoute(state, { ...worktree, hostId: host.id })
  if (route.kind !== 'resolved') {
    throw new Error('工作树传输宿主不明确，请核对原生登记')
  }
  return {
    projectId: worktree.projectId || worktree.repoId,
    repoId: worktree.repoId,
    hostId: host.id,
    runtimeOwnerEnvironmentId: route.route.runtimeEnvironmentId ?? undefined
  }
}
export function findNamedWorktree(scope: NativeWorkspaceScope, branch: string): Worktree | null {
  const found = useAppStore
    .getState()
    .allWorktrees()
    .filter(
      (worktree) =>
        worktree.repoId === scope.repoId &&
        worktree.branch.replace(/^refs\/heads\//, '') === branch &&
        nativeWorkspaceScopeKey(nativeWorkspaceScope(worktree)) === nativeWorkspaceScopeKey(scope)
    )
  if (found.length > 1) {
    throw new Error('存在多个同分支工作树，请在原生项目中核对登记')
  }
  return found[0] ?? null
}
const creating = new Map<string, Promise<Worktree>>()
async function removeWorktreeBestEffort(
  scope: NativeWorkspaceScope,
  target: { kind: 'local' } | { kind: 'environment'; environmentId: string },
  worktreeId: string
): Promise<boolean> {
  try {
    await (target.kind === 'local'
      ? window.api.worktrees.remove({
          worktreeId,
          hostId: scope.hostId,
          force: true,
          skipArchive: true,
          allowFailedArchiveHook: true,
          allowUnverifiedPtyStop: true
        })
      : callRuntimeRpc(target, 'worktree.rm', {
          worktreeId,
          force: true,
          skipArchive: true
        }))
    return true
  } catch {
    return false
  }
}
export async function ensureNamedWorktree(
  scope: NativeWorkspaceScope,
  branch: string,
  name: string
): Promise<Worktree> {
  const existing = findNamedWorktree(scope, branch)
  if (existing) {
    return existing
  }
  const key = `${nativeWorkspaceScopeKey(scope)}:${branch}`
  const pending = creating.get(key)
  if (pending) {
    return pending
  }
  const create = (async () => {
    const target = nativeWorkspaceRuntimeTarget(scope)
    // Local creation must use the direct IPC path: the RPC channel carries the
    // renderer client context, which the worktree-create provenance gate
    // rejects without a paired device identity. Runtime hosts keep the RPC route.
    const result =
      target.kind === 'local'
        ? await window.api.worktrees.create({
            repoId: scope.repoId,
            name,
            branchNameOverride: branch,
            setupDecision: 'inherit'
          })
        : await callRuntimeRpc<CreateWorktreeResult>(
            target,
            'worktree.create',
            {
              repo: `id:${scope.repoId}`,
              name,
              branchNameOverride: branch,
              activate: false,
              setupDecision: 'inherit'
            },
            { timeoutMs: 600_000 }
          )
    const createdBranch = result.worktree.branch.replace(/^refs\/heads\//, '')
    if (createdBranch !== branch) {
      // Native create uniquifies name+branch when the requested branch is already
      // checked out elsewhere (e.g. a tree left by an older toolchain). Roll the stray
      // tree back so retries cannot accumulate orphans; removal is best-effort.
      const rolledBack = await removeWorktreeBestEffort(scope, target, result.worktree.id)
      throw new Error(
        `原生创建未返回约定分支 ${branch}（实际 ${createdBranch}），误建工作树${
          rolledBack ? '已回滚删除' : '回滚失败，请手动清理'
        }。该分支可能被仓内既有工作树占用（旧版工具链遗留或外部创建），清理或在 Orca 收件箱登记后重试`
      )
    }
    // A paired runtime owns its nested SSH registration; do not redirect refresh to client SSH.
    await useAppStore.getState().fetchWorktrees(scope.repoId, {
      executionHostId: scope.runtimeOwnerEnvironmentId
        ? toRuntimeExecutionHostId(scope.runtimeOwnerEnvironmentId)
        : scope.hostId
    })
    const registered = findNamedWorktree(scope, branch)
    if (!registered || registered.id !== result.worktree.id) {
      throw new Error('工作树已创建，等待所属宿主的原生登记刷新后重试')
    }
    return registered
  })()
  creating.set(key, create)
  try {
    return await create
  } finally {
    creating.delete(key)
  }
}
