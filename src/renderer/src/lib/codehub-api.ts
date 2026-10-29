import type { CodeHubApi } from '../../../shared/codehub-api'
import type { Repo } from '../../../shared/repo-types'
import { useAppStore } from '@/store'
import { getExplicitRuntimeOwnerEnvironmentId } from './repo-runtime-owner'
import { callRuntimeRpc, getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'

type RepoOwner = Pick<Repo, 'id' | 'executionHostId' | 'connectionId'>
type OwnerRoutedCodeHubApi = {
  [K in keyof CodeHubApi]: (
    args: Parameters<CodeHubApi[K]>[0],
    owner?: RepoOwner
  ) => ReturnType<CodeHubApi[K]>
}

// Repo ownership selects the runtime for both reads and writes; UI focus may
// have moved to a different host while a task detail remains open.
function route<K extends keyof CodeHubApi>(
  method: K,
  args: Parameters<CodeHubApi[K]>[0],
  owner?: RepoOwner
): Promise<Awaited<ReturnType<CodeHubApi[K]>>> {
  if (owner && owner.id !== args.repoId) {
    return Promise.reject(new Error('CodeHub repository owner does not match the request'))
  }
  const target = getActiveRuntimeTarget({
    activeRuntimeEnvironmentId: getExplicitRuntimeOwnerEnvironmentId(
      owner ? { repos: [owner] } : useAppStore.getState(),
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

export const codehubApi: OwnerRoutedCodeHubApi = {
  viewer: (args, owner) => route('viewer', args, owner),
  listTasks: (args, owner) => route('listTasks', args, owner),
  createIssue: (args, owner) => route('createIssue', args, owner),
  updateIssueTitle: (args, owner) => route('updateIssueTitle', args, owner),
  updateIssueLabels: (args, owner) => route('updateIssueLabels', args, owner),
  listLabels: (args, owner) => route('listLabels', args, owner),
  setIssueState: (args, owner) => route('setIssueState', args, owner),
  closeMr: (args, owner) => route('closeMr', args, owner),
  assignIssue: (args, owner) => route('assignIssue', args, owner),
  mergeMr: (args, owner) => route('mergeMr', args, owner),
  setReviewers: (args, owner) => route('setReviewers', args, owner),
  listPipelines: (args, owner) => route('listPipelines', args, owner),
  mrChecks: (args, owner) => route('mrChecks', args, owner),
  mrChanges: (args, owner) => route('mrChanges', args, owner),
  viewTask: (args, owner) => route('viewTask', args, owner),
  listComments: (args, owner) => route('listComments', args, owner),
  createComment: (args, owner) => route('createComment', args, owner),
  deleteComment: (args, owner) => route('deleteComment', args, owner)
}
