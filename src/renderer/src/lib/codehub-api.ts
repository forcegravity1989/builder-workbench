import type { CodeHubApi } from '../../../shared/codehub-api'
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
  const target =
    execution === 'local'
      ? ({ kind: 'local' } as const)
      : getActiveRuntimeTarget(
          sourceContext
            ? getTaskSourceRuntimeSettings(sourceContext)
            : {
                activeRuntimeEnvironmentId: getExplicitRuntimeOwnerEnvironmentId(
                  useAppStore.getState(),
                  args.repoId
                )
              }
        )
  const routedArgs = sourceContext?.repoId ? { ...args, repoId: sourceContext.repoId } : args
  if (target.kind === 'environment') {
    return callRuntimeRpc(target, `codehub.${method}`, routedArgs, { timeoutMs: 60_000 })
  }
  const call = window.api.codehub[method] as (
    input: typeof args
  ) => Promise<Awaited<ReturnType<CodeHubApi[K]>>>
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
/**
 * 任务页读任务数据固定走本机 CLI：项目身份来自远端登记行，执行与权限用本机。
 * 详情、列表与写操作都用它，避免同一屏一半本机一半远端。
 */
export const localCodehubApi = createCodeHubApi(null, { execution: 'local' })
