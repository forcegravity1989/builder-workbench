import { getLocalProjectWorktreeGitOptions } from '../workspaces/execution-host/project-runtime-git-options'
import { resolveGitRouteForHost } from '../providers/execution-host-provider-dispatch'
import { getRepoExecutionHostId } from '../../shared/execution-host/execution-host'
import { gitExecFileAsync } from '../git/command-runner/git-exec-file'
import { listLocalRepoWorktreesStrict } from '../workspaces/catalog/repo-worktrees'
import { persistWorktreeCreationBase, configurePushAutoSetupRemote } from '../git/worktrees/creation/worktree-add'
import { normalizeGitErrorMessage } from '../../shared/git/remotes/git-remote-error'
import { ensureFixedBranchTracking } from './fixed-workspace-tracking'
import { createFixedWorkspaceService, type FixedWorkspaceRuntime } from './fixed-workspace-service'
import { WorkspaceScopeError } from './workspace-scope-error'
import { createWorkbenchRepoResolver, nativeWorkbenchWorkspaceHost } from './workspace-resolver'

export function nativeFixedWorkspaceService(
  runtime: FixedWorkspaceRuntime,
  store: Parameters<typeof getLocalProjectWorktreeGitOptions>[0]
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
    const route = resolveGitRouteForHost(getRepoExecutionHostId(repo))
    if (route.kind !== 'local') {
      throw new WorkspaceScopeError('invalid-scope', '请通过 Orca 共享主机连接项目所在电脑后准备固定工作区')
    }
    return { options: getLocalProjectWorktreeGitOptions(store, repo) }
  }
  return createFixedWorkspaceService(runtime, {
    git(repo) {
      const { options } = context(repo)
      const reauthorize = () => {
        const current = context(repo)
        if (JSON.stringify(current.options) !== JSON.stringify(options)) {
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
      const { options } = context(repo)
      return listLocalRepoWorktreesStrict(repo, options)
    }
  })
}
