import type { CodeHubApi } from '../../../shared/codehub-api'
import { useAppStore } from '@/store'
import { getExplicitRuntimeOwnerEnvironmentId } from './repo-runtime-owner'
import { callRuntimeRpc, getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'

// Repo ownership selects the runtime for both reads and writes; UI focus may
// have moved to a different host while a task detail remains open.
function route<K extends keyof CodeHubApi>(
  method: K,
  args: Parameters<CodeHubApi[K]>[0]
): Promise<Awaited<ReturnType<CodeHubApi[K]>>> {
  const target = getActiveRuntimeTarget({
    activeRuntimeEnvironmentId: getExplicitRuntimeOwnerEnvironmentId(
      useAppStore.getState(),
      args.repoId
    )
  })
  if (target.kind === 'environment') {
    return callRuntimeRpc(target, `codehub.${method}`, args, { timeoutMs: 60_000 })
  }
  const call = window.api.codehub[method] as (
    input: typeof args
  ) => Promise<Awaited<ReturnType<CodeHubApi[K]>>>
  return call(args)
}

export const codehubApi: CodeHubApi = {
  listTasks: (args) => route('listTasks', args),
  createIssue: (args) => route('createIssue', args),
  updateIssueTitle: (args) => route('updateIssueTitle', args),
  setIssueState: (args) => route('setIssueState', args),
  closeMr: (args) => route('closeMr', args),
  assignIssue: (args) => route('assignIssue', args),
  mergeMr: (args) => route('mergeMr', args),
  setReviewers: (args) => route('setReviewers', args),
  listPipelines: (args) => route('listPipelines', args),
  mrChecks: (args) => route('mrChecks', args),
  mrChanges: (args) => route('mrChanges', args),
  viewTask: (args) => route('viewTask', args),
  listComments: (args) => route('listComments', args),
  createComment: (args) => route('createComment', args),
  deleteComment: (args) => route('deleteComment', args)
}
