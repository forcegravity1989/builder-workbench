import type { ProjectRuntimeResolutionStore } from '../local-project-runtime-resolution'
import { getLocalProjectWorktreeGitOptions } from '../project-runtime-git-options'
import { getRepoExecutionHostId } from '../../shared/execution-host'
import { gitExecFileAsync } from '../git/runner'
import { listLocalRepoWorktreesStrict } from '../repo-worktrees'
import { persistWorktreeCreationBase, configurePushAutoSetupRemote } from '../git/worktree-add'
import { normalizeGitErrorMessage } from '../../shared/git-remote-error'
import { ensureFixedBranchTracking } from './fixed-workspace-tracking'
import { createFixedWorkspaceService, type FixedWorkspaceRuntime } from './fixed-workspace-service'
import { WorkspaceScopeError } from './workspace-scope-error'
import { createWorkbenchRepoResolver, nativeWorkbenchWorkspaceHost } from './workspace-resolver'

export function nativeFixedWorkspaceService(
  runtime: FixedWorkspaceRuntime,
  store: ProjectRuntimeResolutionStore
) {
  const resolver = createWorkbenchRepoResolver(nativeWorkbenchWorkspaceHost(runtime))
  const context = (repo: ReturnType<FixedWorkspaceRuntime['listRepos']>[number]) => {
    const current = resolver.resolveRepo({
      repoId: repo.id,
      hostId: getRepoExecutionHostId(repo)
    }).repo
    if (
      current.path !== repo.path ||
      current.worktreeBaseRef !== repo.worktreeBaseRef ||
      current.worktreeBasePath !== repo.worktreeBasePath
    ) {
      throw new WorkspaceScopeError(
        'invalid-scope',
        '项目位置或工作区配置已改变，请重新进入项目后重试'
      )
    }
    return getLocalProjectWorktreeGitOptions(store, repo)
  }

  return createFixedWorkspaceService(runtime, {
    git(repo) {
      const options = context(repo)
      const reauthorize = () => {
        if (JSON.stringify(context(repo)) !== JSON.stringify(options)) {
          throw new WorkspaceScopeError('invalid-scope', '项目执行环境已改变，请重新进入项目后重试')
        }
      }
      return {
        exec: (args) => {
          reauthorize()
          return gitExecFileAsync(args, {
            cwd: repo.path,
            ...options,
            useConfiguredSshCommandForNetwork: true,
            timeout: 60000
          })
        },
        fetch: async (remote, branch, ref) => {
          reauthorize()
          try {
            await gitExecFileAsync(['fetch', '--no-tags', remote, `+refs/heads/${branch}:${ref}`], {
              cwd: repo.path,
              ...options,
              useConfiguredSshCommandForNetwork: true,
              timeout: 60000
            })
          } catch (error) {
            throw new WorkspaceScopeError(
              'branch-source-unavailable',
              normalizeGitErrorMessage(error, 'fetch')
            )
          }
        },
        recordCreation: async (branch, source, expectedHead) => {
          reauthorize()
          const head = (
            await gitExecFileAsync(['rev-parse', '--verify', `refs/heads/${branch}^{commit}`], {
              cwd: repo.path,
              ...options
            })
          ).stdout.trim()
          const base = (
            await gitExecFileAsync(['rev-parse', '--verify', `${source}^{commit}`], {
              cwd: repo.path,
              ...options
            })
          ).stdout.trim()
          if (head !== expectedHead || base !== expectedHead) {
            throw new WorkspaceScopeError(
              'branch-source-changed',
              '固定分支或起点已改变，请核对后重试'
            )
          }
          reauthorize()
          // The branch is prepared before native checkoutExistingBranch, which skips these helpers.
          await persistWorktreeCreationBase(repo.path, branch, source, options)
          reauthorize()
          await configurePushAutoSetupRemote(repo.path, options)
        },
        ensureTracking: (remote, branch, expectedHead) =>
          ensureFixedBranchTracking(
            (args) => {
              reauthorize()
              return gitExecFileAsync(args, { cwd: repo.path, ...options, timeout: 10000 })
            },
            remote,
            branch,
            expectedHead
          )
      }
    },
    trees(repo) {
      return listLocalRepoWorktreesStrict(repo, context(repo))
    }
  })
}
