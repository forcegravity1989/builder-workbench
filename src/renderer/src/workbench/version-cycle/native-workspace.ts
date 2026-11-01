import { useAppStore } from '@/store'
import { withRepoHostOwnership } from '@/store/slices/worktrees/listing/worktree-host-ownership'
import { assertRuntimeEnvironmentCapability, callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { resolveExactWorktreeRoute, routeForOwner } from '@/lib/worktree-owner-route'
import { branchName } from '@/lib/git-utils'
import {
  getRepoExecutionHostId,
  parseExecutionHostId,
  toRuntimeExecutionHostId
} from '../../../../shared/execution-host'
import type { Worktree } from '../../../../shared/worktree/types'
import { WORKBENCH_FIXED_WORKSPACE_RUNTIME_CAPABILITY } from '../../../../shared/protocol-version'
import {
  fixedWorkspaceDefinition,
  fixedWorkspaceRequestForBranch,
  type FixedWorkspaceEnsureResult
} from '../../../../shared/workbench/fixed-workspace'
import type { VersionMaterialResult } from '../../../../shared/workbench/version-material-request'
import { ownerSpelledHostId } from '../version-binding-port'
import { VersionMaterialPortError } from '../../../../shared/workbench/version-material-client'
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
        branchName(worktree.branch) === branch &&
        nativeWorkspaceScopeKey(nativeWorkspaceScope(worktree)) === nativeWorkspaceScopeKey(scope)
    )
  if (found.length > 1) {
    throw new Error('存在多个同分支工作树，请在原生项目中核对登记')
  }
  return found[0] ?? null
}

/** Discovery, exact branch restoration, registration and races all belong to the owner service. */
export async function ensureNamedWorktree(
  scope: NativeWorkspaceScope,
  branch: string,
  name: string
): Promise<Worktree> {
  const definition = fixedWorkspaceRequestForBranch(branch)
  if (fixedWorkspaceDefinition(definition).name !== name) {
    throw new Error('固定工作区名称与用途不一致')
  }
  const target = nativeWorkspaceRuntimeTarget(scope)
  const ownerHostId =
    target.kind === 'environment' ? toRuntimeExecutionHostId(target.environmentId) : scope.hostId
  if (target.kind === 'environment') {
    await assertRuntimeEnvironmentCapability(
      target.environmentId,
      WORKBENCH_FIXED_WORKSPACE_RUNTIME_CAPABILITY,
      '请更新工作区所属宿主后再准备固定工作区'
    )
  }
  const result = await callRuntimeRpc<VersionMaterialResult<FixedWorkspaceEnsureResult>>(
    target,
    'workbench.fixedWorkspace.ensure',
    {
      repoId: scope.repoId,
      hostId: ownerSpelledHostId(scope.hostId),
      ...definition,
      setupDecision: 'inherit'
    },
    { timeoutMs: 600000 }
  )
  if (!result.ok) {
    throw new VersionMaterialPortError(result.error.code, result.error.message)
  }
  // A refresh failure must not turn a completed host mutation into another create attempt.
  try {
    await useAppStore.getState().fetchWorktrees(scope.repoId, {
      executionHostId: ownerHostId
    })
  } catch {
    /* Native registration notifications also deliver the completed result. */
  }
  // RPC rows use owner-relative host IDs; activation requires the client's host identity.
  return withRepoHostOwnership(result.value.worktree, ownerHostId)
}
