import {
  getWorktreeExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '../../shared/execution-host'
import type { Repo } from '../../shared/repo-types'
import type { Worktree } from '../../shared/worktree/types'
import { resolveRepoOwnershipEvidence } from '../ipc/worktrees/listing/worktree-host-ownership'
import { WorkspaceScopeError } from './workspace-scope-error'

export type WorkbenchWorkspaceScope = { repoId: string; worktreeId: string; hostId: string }
export type WorkbenchWorkspaceTarget = {
  hostId: ExecutionHostId
  repoPath: string
  worktreePath: string
}
/** Registered repo facts a BW host adapter needs beyond the resolved paths. */
export type WorkbenchWorkspaceRepo = Pick<
  Repo,
  | 'id'
  | 'path'
  | 'kind'
  | 'connectionId'
  | 'executionHostId'
  | 'worktreeBaseRef'
  | 'worktreeBasePath'
>
export type WorkbenchWorkspaceHost = {
  listRepos(): WorkbenchWorkspaceRepo[]
  listWorktrees(
    scope: WorkbenchWorkspaceScope
  ): Promise<
    Pick<
      Worktree,
      'id' | 'repoId' | 'path' | 'hostId' | 'runtimeOwnerEnvironmentId' | 'isArchived'
    >[]
  >
}

/** Resolve registered identity on its owner runtime; executors retain Git and workflow checks. */
export function createWorkbenchWorkspaceResolver(host: WorkbenchWorkspaceHost) {
  async function authorize(scope: WorkbenchWorkspaceScope): Promise<{
    target: WorkbenchWorkspaceTarget
    repo: WorkbenchWorkspaceRepo
  }> {
    const hostId = parseExecutionHostId(scope.hostId)
    if (!hostId || hostId.kind === 'runtime') {
      throw new WorkspaceScopeError('invalid-scope', '请通过工作树所属的 Orca runtime 访问')
    }
    const candidates = host.listRepos().filter((repo) => repo.id === scope.repoId)
    const evidence = candidates.map(resolveRepoOwnershipEvidence)
    if (evidence.some((owner) => owner.status !== 'owned')) {
      throw new WorkspaceScopeError('invalid-scope', '项目宿主登记无效或冲突')
    }
    const repos = candidates.filter((_, index) => {
      const owner = evidence[index]
      return owner.status === 'owned' && owner.hostId === hostId.id
    })
    if (repos.length !== 1 || repos[0].kind === 'folder') {
      throw new WorkspaceScopeError('invalid-scope', 'Git 项目身份不存在或不唯一')
    }
    const repo = repos[0]
    const trees = (await host.listWorktrees(scope)).filter(
      (tree) =>
        tree.id === scope.worktreeId &&
        tree.repoId === repo.id &&
        (tree.hostId == null || parseExecutionHostId(tree.hostId) !== null) &&
        getWorktreeExecutionHostId(tree, repo) === hostId.id &&
        !tree.runtimeOwnerEnvironmentId
    )
    if (trees.length !== 1 || trees[0].isArchived) {
      throw new WorkspaceScopeError('invalid-scope', '工作树身份不存在、已归档或不唯一')
    }
    return {
      target: { hostId: hostId.id, repoPath: repo.path, worktreePath: trees[0].path },
      repo
    }
  }
  return {
    async resolve(scope: WorkbenchWorkspaceScope) {
      const capturedScope = {
        repoId: scope.repoId,
        worktreeId: scope.worktreeId,
        hostId: scope.hostId
      }
      const resolved = await authorize(capturedScope)
      const target = Object.freeze(resolved.target)
      const repo = Object.freeze(resolved.repo)
      return {
        target,
        repo,
        async reauthorize() {
          const current = await authorize(capturedScope)
          if (
            current.target.repoPath !== target.repoPath ||
            current.target.worktreePath !== target.worktreePath
          ) {
            throw new WorkspaceScopeError('invalid-scope', '工作树位置已改变，请重新打开')
          }
        }
      }
    }
  }
}

export function nativeWorkbenchWorkspaceHost(runtime: {
  listRepos: WorkbenchWorkspaceHost['listRepos']
  showManagedWorktree(
    selector: string,
    requiredHostId?: ExecutionHostId
  ): Promise<Awaited<ReturnType<WorkbenchWorkspaceHost['listWorktrees']>>[number]>
}): WorkbenchWorkspaceHost {
  return {
    listRepos: () => runtime.listRepos(),
    listWorktrees: async (scope) => {
      const hostId = parseExecutionHostId(scope.hostId)
      if (!hostId || hostId.kind === 'runtime') {
        throw new WorkspaceScopeError('invalid-scope', '请通过工作树所属的 Orca runtime 访问')
      }
      return [await runtime.showManagedWorktree(`id:${scope.worktreeId}`, hostId.id)]
    }
  }
}
