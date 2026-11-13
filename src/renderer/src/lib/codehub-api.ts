import { parseCodeHubRemote } from '../../../shared/codehub'
import type { CodeHubApi } from '../../../shared/codehub-api'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'
import { findRepoForHost } from '@/store/slices/repo-host-identity'
import { useAppStore } from '@/store'
import { getExplicitRuntimeOwnerEnvironmentId } from './repo-runtime-owner'
import { callRuntimeRpc, getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import {
  getTaskSourceRuntimeSettings,
  type TaskSourceContext
} from '../../../shared/task-source-context'

// Repo ownership selects the runtime for both reads and writes; UI focus may
// have moved to a different host while a task detail remains open.
function route<K extends keyof CodeHubApi>(
  method: K,
  args: Parameters<CodeHubApi[K]>[0],
  sourceContext?: TaskSourceContext | null,
  execution: 'owner' | 'local' = 'owner'
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
      (row) => (!repoId || row.id === repoId) && row.path === args.repoPath
    )
    const repo =
      sourceContext?.hostId && repoId
        ? findRepoForHost(matches, repoId, { hostId: sourceContext.hostId })
        : matches.length === 1
          ? matches[0]
          : null
    const identity = repo?.gitRemoteIdentity
    const remoteUrl = parseCodeHubRemote(identity?.remoteUrl)
      ? identity?.remoteUrl
      : identity?.canonicalKey
    if (!remoteUrl) {
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
  options?: { execution?: 'owner' | 'local' }
): CodeHubApi {
  if (sourceContext && sourceContext.provider !== 'codehub') {
    throw new Error('CodeHub source context required')
  }
  const execution = options?.execution ?? 'owner'
  const call = <K extends keyof CodeHubApi>(method: K, args: Parameters<CodeHubApi[K]>[0]) =>
    route(method, args, sourceContext, execution)
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
export function createTaskPageCodeHubApi(sourceContext?: TaskSourceContext | null): CodeHubApi {
  return createCodeHubApi(sourceContext, { execution: isWorkbenchShell() ? 'local' : 'owner' })
}

export const localCodehubApi = createTaskPageCodeHubApi()
