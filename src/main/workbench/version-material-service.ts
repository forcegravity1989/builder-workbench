import { getRepoExecutionHostId, getWorktreeExecutionHostId } from '../../shared/execution-host'
import type { Repo } from '../../shared/repo-types'
import type { Worktree } from '../../shared/worktree/types'
import {
  VersionMaterialReadSchema,
  VersionMaterialSaveSchema,
  VersionMaterialScopeSchema,
  type VersionMaterialScope,
  type VersionMaterialRead,
  type VersionMaterialSave
} from '../../shared/workbench/version-material-request'
import { MaterialScopeError } from './version-material-error'
import type {
  createVersionMaterialWorkspace,
  VersionMaterialWorkspace
} from './version-material-workspace'
export { materialResult } from './version-material-error'

export type VersionMaterialHost = {
  listRepos(): Pick<Repo, 'id' | 'path' | 'kind' | 'connectionId' | 'executionHostId'>[]
  listWorktrees(
    scope: VersionMaterialScope
  ): Promise<
    Pick<
      Worktree,
      'id' | 'repoId' | 'path' | 'hostId' | 'runtimeOwnerEnvironmentId' | 'isArchived'
    >[]
  >
}
export type VersionMaterialTarget = VersionMaterialWorkspace & { hostId: string }
export type VersionMaterialExecutor = (
  target: VersionMaterialTarget,
  reauthorize: () => Promise<void>
) => ReturnType<typeof createVersionMaterialWorkspace>

/** IDs are resolved on the owning Orca runtime; request payloads never grant path authority. */
export function createVersionMaterialService(
  host: VersionMaterialHost,
  execute: VersionMaterialExecutor
) {
  async function authorize(scope: VersionMaterialScope): Promise<VersionMaterialTarget> {
    const repos = host
      .listRepos()
      .filter((repo) => repo.id === scope.repoId && getRepoExecutionHostId(repo) === scope.hostId)
    if (repos.length !== 1 || repos[0].kind === 'folder') {
      throw new MaterialScopeError('invalid-scope', 'Git 项目身份不存在或不唯一')
    }
    const repo = repos[0]
    const trees = (await host.listWorktrees(scope)).filter(
      (tree) =>
        tree.id === scope.worktreeId &&
        tree.repoId === repo.id &&
        getWorktreeExecutionHostId(tree, repo) === scope.hostId &&
        !tree.runtimeOwnerEnvironmentId
    )
    if (trees.length !== 1 || trees[0].isArchived) {
      throw new MaterialScopeError('invalid-scope', '工作树身份不存在、已归档或不唯一')
    }
    return { hostId: scope.hostId, repoPath: repo.path, worktreePath: trees[0].path }
  }
  async function workspace(scope: VersionMaterialScope) {
    const target = await authorize(scope)
    return execute(target, async () => {
      const current = await authorize(scope)
      if (current.repoPath !== target.repoPath || current.worktreePath !== target.worktreePath) {
        throw new MaterialScopeError('invalid-scope', '工作树位置已改变，请重新打开')
      }
    })
  }
  return {
    async list(input: VersionMaterialScope) {
      const scope = VersionMaterialScopeSchema.parse(input)
      return (await workspace(scope)).list(scope)
    },
    async read(input: VersionMaterialRead) {
      const request = VersionMaterialReadSchema.parse(input)
      return (await workspace(request)).read(request)
    },
    async save(input: VersionMaterialSave) {
      const request = VersionMaterialSaveSchema.parse(input)
      return (await workspace(request)).save(request)
    }
  }
}
