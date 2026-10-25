import { useAppStore } from '@/store'
import { findRepoForHost } from '@/store/slices/repo-host-identity'
import { mergeExternalWorktreeInboxPaths } from '../../../../shared/external-worktree-inbox'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { resolveExactWorktreeRoute, routeForOwner } from '@/lib/worktree-owner-route'
import { branchName } from '@/lib/git-utils'
import {
  getRepoExecutionHostId,
  parseExecutionHostId,
  toRuntimeExecutionHostId
} from '../../../../shared/execution-host'
import type { RuntimeRepoSearchRefs } from '../../../../shared/runtime-types'
import { REPO_SEARCH_REFS_MAX_LIMIT } from '../../../../shared/repo-search-limits'
import type { CreateWorktreeResult } from '../../../../shared/worktree/create-types'
import { matchReusableBranchRef } from '../../../../shared/workbench/reusable-branch-ref'
import type {
  DetectedWorktree,
  DetectedWorktreeListResult,
  Worktree
} from '../../../../shared/worktree/types'
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
// Why: HMR/remounts create fresh module instances; a module-local in-flight map would
// allow two parallel creates of the same fixed tree (the loser gets a uniquified
// branch). Share the lock across module instances via a global key.
const creatingRegistryKey = '__bwCreatingWorktrees' as const
type CreatingMap = Map<string, Promise<Worktree>>
const globalStore = globalThis as typeof globalThis & { [creatingRegistryKey]?: CreatingMap }
const creating: CreatingMap = (globalStore[creatingRegistryKey] ??= new Map())
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
async function detectedTrees(
  scope: NativeWorkspaceScope,
  target: ReturnType<typeof nativeWorkspaceRuntimeTarget>
): Promise<DetectedWorktree[]> {
  try {
    const result = await callRuntimeRpc<DetectedWorktreeListResult>(
      target,
      'worktree.detectedList',
      { repo: `id:${scope.repoId}` }
    )
    return result?.worktrees ?? []
  } catch {
    return []
  }
}

async function findNamedBaseRef(
  scope: NativeWorkspaceScope,
  target: ReturnType<typeof nativeWorkspaceRuntimeTarget>,
  branch: string
): Promise<string | undefined> {
  const result = await callRuntimeRpc<RuntimeRepoSearchRefs>(
    target,
    'repo.searchRefs',
    { repo: `id:${scope.repoId}`, query: branch, limit: REPO_SEARCH_REFS_MAX_LIMIT },
    { timeoutMs: 15_000 }
  )
  // 与 main 侧版本准备同一匹配实现（G2 F8 提共享）：核对来源再采用。
  const match = matchReusableBranchRef(result, branch)
  if (match.kind === 'unverifiable') {
    throw new Error(`无法完整确认分支 ${branch} 的来源，请在项目中核对分支后重试`)
  }
  if (match.kind === 'ambiguous') {
    throw new Error(`多个远端存在分支 ${branch}，请先在项目中检出要使用的分支后重试`)
  }
  return match.kind === 'ref' ? match.refName : undefined
}

/** Register an externally-created tree through the native inbox import surface. */
async function importExternalTree(scope: NativeWorkspaceScope, treePath: string): Promise<boolean> {
  try {
    const state = useAppStore.getState()
    const hostId = scope.runtimeOwnerEnvironmentId
      ? toRuntimeExecutionHostId(scope.runtimeOwnerEnvironmentId)
      : scope.hostId
    const repo = findRepoForHost(state.repos, scope.repoId, { hostId })
    if (!repo) {
      return false
    }
    const updated = await state.updateRepo(
      scope.repoId,
      {
        importedExternalWorktreePaths: mergeExternalWorktreeInboxPaths(
          repo.importedExternalWorktreePaths,
          [treePath]
        )
      },
      { hostId }
    )
    if (!updated) {
      return false
    }
    return await useAppStore.getState().fetchWorktrees(scope.repoId, {
      executionHostId: hostId,
      requireAuthoritative: true
    })
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
  const scopePrefix = `${nativeWorkspaceScopeKey(scope)}:`
  const key = `${scopePrefix}${branch}`
  const pending = creating.get(key)
  if (pending) {
    return pending
  }
  // Repo imports replace one path list. Serialize sibling preparations so each
  // appends to the latest registration instead of hiding another workflow's tree.
  const preceding = [...creating]
    .filter(([entryKey]) => entryKey.startsWith(scopePrefix))
    .map(([, preparation]) => preparation)
  const create = (async () => {
    await Promise.allSettled(preceding)
    const target = nativeWorkspaceRuntimeTarget(scope)
    // A git-level scan sees trees the store has not registered yet (external or
    // in-flight). Adopting an existing holder — or failing before create — is what
    // stops native create from uniquifying name+branch into orphan trees.
    const holder = (await detectedTrees(scope, target)).find(
      (item) => branchName(item.branch) === branch
    )
    if (holder) {
      const imported = await importExternalTree(scope, holder.path)
      const adopted = imported ? findNamedWorktree(scope, branch) : null
      if (adopted) {
        return adopted
      }
      throw new Error(
        `分支 ${branch} 已被工作树 ${holder.path} 占用（导入登记未成功），请在 Orca 侧栏收件箱登记或手动清理后重试`
      )
    }
    // Passing the matching ref lets native creation reuse a local branch or
    // create it from its remote ref instead of treating that ref as a conflict.
    const baseBranch = await findNamedBaseRef(scope, target, branch)
    // Local creation must use the direct IPC path: the RPC channel carries the
    // renderer client context, which the worktree-create provenance gate
    // rejects without a paired device identity. Runtime hosts keep the RPC route.
    const result =
      target.kind === 'local'
        ? await window.api.worktrees.create({
            repoId: scope.repoId,
            name,
            branchNameOverride: branch,
            ...(baseBranch ? { baseBranch } : {}),
            setupDecision: 'inherit'
          })
        : await callRuntimeRpc<CreateWorktreeResult>(
            target,
            'worktree.create',
            {
              repo: `id:${scope.repoId}`,
              name,
              branchNameOverride: branch,
              ...(baseBranch ? { baseBranch } : {}),
              activate: false,
              setupDecision: 'inherit'
            },
            { timeoutMs: 600_000 }
          )
    const createdBranch = branchName(result.worktree.branch)
    if (createdBranch !== branch) {
      // Native create uniquifies name+branch when the requested branch is already
      // checked out elsewhere (e.g. a tree left by an older toolchain). Roll the stray
      // tree back so retries cannot accumulate orphans; removal is best-effort.
      const rolledBack = await removeWorktreeBestEffort(scope, target, result.worktree.id)
      // A parallel create (remounted module instance, double mount) may have won the
      // branch while this one was in flight: adopt the winner instead of surfacing an
      // error for a race the user cannot see.
      await useAppStore.getState().fetchWorktrees(scope.repoId, {
        executionHostId: scope.runtimeOwnerEnvironmentId
          ? toRuntimeExecutionHostId(scope.runtimeOwnerEnvironmentId)
          : scope.hostId
      })
      const winner = findNamedWorktree(scope, branch)
      if (winner) {
        return winner
      }
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
