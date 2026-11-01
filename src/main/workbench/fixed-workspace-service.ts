import type { Repo } from '../../shared/repo-types'
import {
  getRepoExecutionHostId,
  getWorktreeExecutionHostId,
  type ExecutionHostId
} from '../../shared/execution-host'
import { mergeExternalWorktreeInboxPaths } from '../../shared/external-worktree-inbox'
import type {
  GitWorktreeInfo,
  Worktree,
  DetectedWorktreeListResult
} from '../../shared/worktree/types'
import type { CreateWorktreeResult } from '../../shared/worktree/create-types'
import {
  FixedWorkspaceEnsureSchema,
  fixedWorkspaceDefinition,
  type FixedWorkspaceEnsureRequest,
  type FixedWorkspaceEnsureResult
} from '../../shared/workbench/fixed-workspace'
import type { RuntimeManagedWorktreeCreateArgs } from '../runtime/runtime-managed-worktree-create-types'
import { areWorktreePathsEqual } from '../ipc/worktree-logic'
import { createWorkbenchRepoResolver, nativeWorkbenchWorkspaceHost } from './workspace-resolver'
import { ensureFixedBranch, type FixedWorkspaceGit } from './fixed-workspace-branch'
import { WorkspaceScopeError } from './workspace-scope-error'

export type FixedWorkspaceRuntime = {
  listRepos(): Repo[]
  listManagedWorktrees(
    repo: string,
    limit?: number
  ): Promise<{ worktrees: Worktree[]; truncated?: boolean }>
  listDetectedManagedWorktrees(repo: string): Promise<DetectedWorktreeListResult>
  createManagedWorktree(args: RuntimeManagedWorktreeCreateArgs): Promise<CreateWorktreeResult>
  removeManagedWorktree(selector: string, options: { hostId: ExecutionHostId }): Promise<unknown>
  updateRepo(selector: string, updates: Pick<Repo, 'importedExternalWorktreePaths'>): Promise<Repo>
  showManagedWorktree: Parameters<typeof nativeWorkbenchWorkspaceHost>[0]['showManagedWorktree']
}

export type FixedWorkspaceHost = {
  git(repo: Repo): FixedWorkspaceGit
  trees(repo: Repo): Promise<GitWorktreeInfo[]>
}

const pending = new WeakMap<object, Map<string, Promise<FixedWorkspaceEnsureResult>>>()
const repoQueues = new WeakMap<object, Map<string, Promise<FixedWorkspaceEnsureResult>>>()
const branchName = (value: string) => value.replace(/^refs\/heads\//, '')

/** One owner-side preparation chain; callers retain their own materials and version binding. */
export function createFixedWorkspaceService(
  runtime: FixedWorkspaceRuntime,
  host: FixedWorkspaceHost
) {
  const resolver = createWorkbenchRepoResolver(nativeWorkbenchWorkspaceHost(runtime))
  let requests = pending.get(runtime)
  if (!requests) {
    requests = new Map()
    pending.set(runtime, requests)
  }
  let queues = repoQueues.get(runtime)
  if (!queues) {
    queues = new Map()
    repoQueues.set(runtime, queues)
  }

  async function ensure(input: FixedWorkspaceEnsureRequest): Promise<FixedWorkspaceEnsureResult> {
    const request = FixedWorkspaceEnsureSchema.parse(input)
    const definition = fixedWorkspaceDefinition(request)
    const resolved = resolver.resolveRepo(request)
    const repo = runtime
      .listRepos()
      .find(
        (candidate) =>
          candidate.id === resolved.repo.id &&
          candidate.path === resolved.repo.path &&
          getRepoExecutionHostId(candidate) === resolved.hostId
      )!
    const hostId = resolved.hostId
    const repoSelector = `id:${repo.id}`
    const key = JSON.stringify([hostId, repo.id, definition.branch])
    const repoKey = JSON.stringify([hostId, repo.id])
    const inflight = requests!.get(key)
    if (inflight) {
      return inflight
    }

    async function existing(): Promise<Worktree | null> {
      const holders = (await host.trees(repo)).filter(
        (tree) => branchName(tree.branch) === definition.branch
      )
      if (holders.length > 1) {
        throw new WorkspaceScopeError(
          'branch-occupied',
          `分支 ${definition.branch} 被多个工作树检出，请核对登记`
        )
      }
      const holder = holders[0]
      if (!holder) {
        return null
      }
      if (holder.isMainWorktree) {
        throw new WorkspaceScopeError(
          'branch-occupied',
          `固定分支 ${definition.branch} 正由项目主目录检出，请先在原生项目中核对`
        )
      }
      const detected = await runtime.listDetectedManagedWorktrees(repoSelector)
      if (!detected.authoritative) {
        throw new WorkspaceScopeError(
          'workspace-unavailable',
          '无法核实工作树的原生登记，请检查所属宿主后重试'
        )
      }
      const record = detected.worktrees.find((tree) =>
        areWorktreePathsEqual(tree.path, holder.path)
      )
      if (record?.isArchived) {
        throw new WorkspaceScopeError(
          'branch-occupied',
          `分支 ${definition.branch} 被已归档工作树 ${holder.path} 占用，请在原生项目取消归档后重试`
        )
      }
      const list = async () => {
        const result = await runtime.listManagedWorktrees(repoSelector, 10000)
        if (result.truncated) {
          throw new WorkspaceScopeError('workspace-unavailable', '工作树清单不完整，请核对原生登记')
        }
        return result.worktrees.find(
          (tree) =>
            areWorktreePathsEqual(tree.path, holder.path) &&
            getWorktreeExecutionHostId(tree, repo) === hostId
        )
      }
      let registered = await list()
      if (!registered) {
        // Registration uses the existing native inbox surface, preserving sibling imports.
        const latestRepo = runtime
          .listRepos()
          .find(
            (candidate) =>
              candidate.id === repo.id &&
              candidate.path === repo.path &&
              getRepoExecutionHostId(candidate) === hostId
          )
        if (!latestRepo) {
          throw new WorkspaceScopeError('invalid-scope', '项目登记已改变，请重新进入项目')
        }
        await runtime.updateRepo(repoSelector, {
          importedExternalWorktreePaths: mergeExternalWorktreeInboxPaths(
            latestRepo.importedExternalWorktreePaths,
            [holder.path]
          )
        })
        registered = await list()
      }
      if (!registered || registered.isArchived) {
        throw new WorkspaceScopeError(
          'workspace-unavailable',
          `工作树 ${holder.path} 已存在，但原生登记未就绪，请核对后重试`
        )
      }
      return registered
    }

    const preceding = queues!.get(repoKey)
    const run = (async (): Promise<FixedWorkspaceEnsureResult> => {
      // Native inbox updates replace one repo path list; sibling fixed trees must merge serially.
      if (preceding) {
        await preceding.catch(() => undefined)
      }
      const found = await existing()
      if (found) {
        return { state: 'existing', worktree: found }
      }
      const { compareBaseRef } = await ensureFixedBranch(
        host.git(repo),
        definition.branch,
        repo.worktreeBaseRef
      )
      const winner = await existing()
      if (winner) {
        return { state: 'existing', worktree: winner }
      }
      let created: Worktree
      try {
        const current = resolver.resolveRepo(request).repo
        if (
          current.path !== repo.path ||
          current.worktreeBasePath !== repo.worktreeBasePath ||
          current.worktreeBaseRef !== repo.worktreeBaseRef
        ) {
          throw new WorkspaceScopeError(
            'invalid-scope',
            '项目工作区配置已改变，请重新进入项目后重试'
          )
        }
        const result = await runtime.createManagedWorktree({
          repoSelector,
          name: definition.name,
          branchNameOverride: definition.branch,
          // A pre-existing exact local branch bypasses generic new-work PR/name avoidance.
          baseBranch: definition.branch,
          compareBaseRef,
          activate: false,
          setupDecision: request.setupDecision
        })
        created = result.worktree
      } catch (error) {
        const raced = await existing()
        if (raced) {
          return { state: 'existing', worktree: raced }
        }
        throw error
      }
      if (branchName(created.branch) !== definition.branch) {
        let cleaned = false
        try {
          await runtime.removeManagedWorktree(`id:${created.id}`, { hostId })
          cleaned = true
        } catch {
          /* Native safety rules decide whether removal is permitted. */
        }
        const raced = await existing()
        if (raced) {
          return { state: 'existing', worktree: raced }
        }
        throw new WorkspaceScopeError(
          'create-branch-mismatch',
          `固定工作区应使用分支 ${definition.branch}，原生返回 ${branchName(created.branch)}；误建树${cleaned ? '已按原生规则清理' : '未能清理，请核对原生登记'}。请核对实际分支和目录后重试`
        )
      }
      return { state: 'created', worktree: created }
    })()
    requests!.set(key, run)
    queues!.set(repoKey, run)
    try {
      return await run
    } finally {
      if (requests!.get(key) === run) {
        requests!.delete(key)
      }
      if (queues!.get(repoKey) === run) {
        queues!.delete(repoKey)
      }
    }
  }
  return { ensure }
}
