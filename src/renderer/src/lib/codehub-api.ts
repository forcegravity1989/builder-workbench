import { parseCodeHubRemote } from '../../../shared/codehub'
import type { CodeHubApi } from '../../../shared/codehub-api'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import { useAppStore } from '@/store'
import { getExplicitRuntimeOwnerEnvironmentId } from './repo-runtime-owner'
import { callRuntimeRpc, getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import {
  getTaskSourceRuntimeSettings,
  type TaskSourceContext
} from '../../../shared/task-source-context'

type CodeHubTaskRepository = { host?: string | null; project?: string | null }

// Source ownership identifies the registration even when BW uses the local account;
// later UI focus changes must not redirect an open task.
function route<K extends keyof CodeHubApi>(
  method: K,
  args: Parameters<CodeHubApi[K]>[0],
  sourceContext?: TaskSourceContext | null,
  execution: 'owner' | 'local' = 'owner',
  taskRepository?: CodeHubTaskRepository
): Promise<Awaited<ReturnType<CodeHubApi[K]>>> {
  const call = (input: typeof args) =>
    (
      window.api.codehub[method] as (
        input: typeof args
      ) => Promise<Awaited<ReturnType<CodeHubApi[K]>>>
    )(input)
  const repoId = sourceContext?.repoId ?? args.repoId
  const routedArgs = repoId !== args.repoId ? { ...args, repoId } : args
  if (execution === 'local') {
    const repos = useAppStore.getState().repos
    const matches = repos.filter(
      (row) =>
        (!repoId || row.id === repoId) &&
        row.path === args.repoPath &&
        (!sourceContext?.hostId || getRepoExecutionHostId(row) === sourceContext.hostId)
    )
    const remotes = matches.flatMap((repo) => {
      const identity = repo.gitRemoteIdentity
      const remoteUrl = parseCodeHubRemote(identity?.remoteUrl)
        ? identity?.remoteUrl
        : identity?.canonicalKey
      const remote = parseCodeHubRemote(remoteUrl)
      return remoteUrl && remote ? [{ remoteUrl, remote }] : []
    })
    if (remotes.length === 0) {
      return Promise.reject(new Error('无法解析 CodeHub 仓库身份'))
    }
    const source = sourceContext?.providerIdentity
    const matchesRemote = (
      remote: { host: string; project: string },
      expected: CodeHubTaskRepository
    ): boolean =>
      (!expected.host || expected.host === remote.host) &&
      (!expected.project || expected.project.toLowerCase() === remote.project.toLowerCase())
    const candidates = remotes.filter(
      ({ remote }) =>
        (source?.provider !== 'codehub' || matchesRemote(remote, source)) &&
        (!taskRepository || matchesRemote(remote, taskRepository))
    )
    if (candidates.length === 0) {
      return Promise.reject(new Error('CodeHub 仓库来源已变更，请刷新任务后重试。'))
    }
    const { remoteUrl, remote } = candidates[0]!
    // 本机账号只消费远端身份；无宿主上下文的行内操作也须证明候选属于同一项目。
    if (
      remotes.length !== matches.length ||
      candidates.some((candidate) => !matchesRemote(candidate.remote, remote))
    ) {
      return Promise.reject(new Error('无法解析 CodeHub 仓库身份'))
    }
    return call({ ...routedArgs, remoteUrl })
  }
  const target = getActiveRuntimeTarget(
    sourceContext
      ? getTaskSourceRuntimeSettings(sourceContext)
      : {
          activeRuntimeEnvironmentId: getExplicitRuntimeOwnerEnvironmentId(
            useAppStore.getState(),
            args.repoId
          )
        }
  )
  if (target.kind === 'environment') {
    return callRuntimeRpc(target, `codehub.${method}`, routedArgs, { timeoutMs: 60_000 })
  }
  return call(routedArgs)
}

export function createCodeHubApi(
  sourceContext?: TaskSourceContext | null,
  options?: { execution?: 'owner' | 'local'; taskRepository?: CodeHubTaskRepository }
): CodeHubApi {
  if (sourceContext && sourceContext.provider !== 'codehub') {
    throw new Error('CodeHub source context required')
  }
  const execution = options?.execution ?? 'owner'
  const call = <K extends keyof CodeHubApi>(method: K, args: Parameters<CodeHubApi[K]>[0]) =>
    route(method, args, sourceContext, execution, options?.taskRepository)
  return {
    mrForBranch: (args) => call('mrForBranch', args),
    viewer: (args) => call('viewer', args),
    listTasks: (args) => call('listTasks', args),
    createIssue: (args) => call('createIssue', args),
    updateIssueTitle: (args) => call('updateIssueTitle', args),
    updateIssueLabels: (args) => call('updateIssueLabels', args),
    listLabels: (args) => call('listLabels', args),
    listMembers: (args) => call('listMembers', args),
    setIssueState: (args) => call('setIssueState', args),
    closeMr: (args) => call('closeMr', args),
    assignIssue: (args) => call('assignIssue', args),
    mergeMr: (args) => call('mergeMr', args),
    setReviewers: (args) => call('setReviewers', args),
    listPipelines: (args) => call('listPipelines', args),
    mrChecks: (args) => call('mrChecks', args),
    mrChanges: (args) => call('mrChanges', args),
    viewTask: (args) => call('viewTask', args),
    listComments: (args) => call('listComments', args),
    createComment: (args) => call('createComment', args),
    deleteComment: (args) => call('deleteComment', args)
  }
}

export const codehubApi = createCodeHubApi()
export function createTaskPageCodeHubApi(
  sourceContext?: TaskSourceContext | null,
  taskRepository?: CodeHubTaskRepository
): CodeHubApi {
  return createCodeHubApi(sourceContext, {
    execution: isWorkbenchShell() ? 'local' : 'owner',
    taskRepository
  })
}
