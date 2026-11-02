import type { Store } from '../persistence'
import { getLocalProjectWorktreeGitOptions } from '../project-runtime-git-options'
import { resolveGitRouteForHost } from '../providers/execution-host-provider-dispatch'
import { getRepoExecutionHostId } from '../../shared/execution-host'
import { gitExecFileAsync } from '../git/runner'
import { listLocalRepoWorktreesStrict } from '../repo-worktrees'
import { persistWorktreeCreationBase, configurePushAutoSetupRemote } from '../git/worktree-add'
import { getActiveMultiplexer } from '../ssh/ssh-target-registry'
import { normalizeGitErrorMessage } from '../../shared/git-remote-error'
import type { VersionMaterialResult } from '../../shared/workbench/version-material-request'
import { ensureFixedBranchTracking } from './fixed-workspace-tracking'
import { createFixedWorkspaceService, type FixedWorkspaceRuntime } from './fixed-workspace-service'
import { WorkspaceScopeError } from './workspace-scope-error'
import { createWorkbenchRepoResolver, nativeWorkbenchWorkspaceHost } from './workspace-resolver'

export function nativeFixedWorkspaceService(runtime: FixedWorkspaceRuntime, store: Store) {
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
    if (route.kind === 'runtime') {
      throw new WorkspaceScopeError('invalid-scope', '请通过工作区所属 runtime 准备固定工作区')
    }
    if (route.kind === 'ssh') {
      if (!route.provider) {
        throw new WorkspaceScopeError('host-unavailable', '工作区所属的 SSH 主机未连接')
      }
      return { route, options: {} }
    }
    return { route, options: getLocalProjectWorktreeGitOptions(store, repo) }
  }
  return createFixedWorkspaceService(runtime, {
    git(repo) {
      const { route, options } = context(repo)
      const reauthorize = () => {
        const current = context(repo)
        if (
          current.route.kind !== route.kind ||
          JSON.stringify(current.options) !== JSON.stringify(options) ||
          (current.route.kind === 'ssh' &&
            route.kind === 'ssh' &&
            current.route.provider !== route.provider)
        ) {
          throw new WorkspaceScopeError('invalid-scope', '项目执行环境已改变，请重新进入项目后重试')
        }
      }
      if (route.kind === 'ssh') {
        const provider = route.provider!
        return {
          exec: (args) => {
            reauthorize()
            return provider.exec(args, repo.path, { timeoutMs: 60000 })
          },
          fetch: (remote, branch, ref) => {
            reauthorize()
            return provider.fetchRemoteTrackingRef(repo.path, remote, branch, ref)
          },
          ensureTracking: async (remote, branch, expectedHead) => {
            reauthorize()
            const channel = getActiveMultiplexer(route.connectionId)
            if (!channel) {
              throw new WorkspaceScopeError('host-unavailable', '工作区所属的 SSH 主机未连接')
            }
            let result: VersionMaterialResult<null>
            try {
              result = (await channel.request('workbench.fixedWorkspace.ensureTracking', {
                repoPath: repo.path,
                remote,
                branch,
                expectedHead
              })) as VersionMaterialResult<null>
            } catch {
              throw new WorkspaceScopeError(
                'host-unavailable',
                '无法准备固定分支跟踪，请更新并重新连接 SSH 主机后重试'
              )
            }
            if (!result.ok) {
              throw new WorkspaceScopeError(result.error.code, result.error.message)
            }
          },
          recordCreation: async (branch, source, expectedHead) => {
            reauthorize()
            const channel = getActiveMultiplexer(route.connectionId)
            if (!channel) {
              throw new WorkspaceScopeError('host-unavailable', '工作区所属的 SSH 主机未连接')
            }
            let result: VersionMaterialResult<null>
            try {
              result = (await channel.request('workbench.fixedWorkspace.recordBranchBase', {
                repoPath: repo.path,
                branch,
                source,
                expectedHead
              })) as VersionMaterialResult<null>
            } catch {
              throw new WorkspaceScopeError(
                'host-unavailable',
                '无法记录固定工作区分支起点，请更新并重新连接 SSH 主机后重试'
              )
            }
            if (!result.ok) {
              throw new WorkspaceScopeError(result.error.code, result.error.message)
            }
          }
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
      const { route, options } = context(repo)
      return route.kind === 'ssh'
        ? route.provider!.listWorktrees(repo.path, { signal: new AbortController().signal })
        : listLocalRepoWorktreesStrict(repo, options)
    }
  })
}
