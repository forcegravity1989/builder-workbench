import { useAppStore } from '@/store'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { resolveExactWorktreeRoute, routeForOwner } from '@/lib/worktree-owner-route'
import { getRepoExecutionHostId, parseExecutionHostId } from '../../../../shared/execution-host'
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
        worktree.branch === branch &&
        nativeWorkspaceScopeKey(nativeWorkspaceScope(worktree)) === nativeWorkspaceScopeKey(scope)
    )
  if (found.length > 1) {
    throw new Error('存在多个同分支工作树，请在原生项目中核对登记')
  }
  return found[0] ?? null
}
const creating = new Map<string, Promise<Worktree>>()
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
    const result = await callRuntimeRpc<CreateWorktreeResult>(
      nativeWorkspaceRuntimeTarget(scope),
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
    if (result.worktree.branch !== branch) {
      throw new Error('原生创建未返回约定分支，请检查工作树')
    }
    await useAppStore.getState().fetchWorktrees(scope.repoId, { executionHostId: scope.hostId })
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
