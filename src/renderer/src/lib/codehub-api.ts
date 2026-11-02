import { getRepoExecutionHostId } from '../../../shared/execution-host'
import type { CodeHubApi } from '../../../shared/codehub-api'
import { useAppStore } from '@/store'
import { getExplicitRuntimeOwnerEnvironmentId } from './repo-runtime-owner'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/runtime-client-target'

// Repo ownership selects the runtime for both reads and writes; UI focus may
// have moved to a different host while a task detail remains open.
async function route<K extends keyof CodeHubApi>(
  method: K,
  args: Parameters<CodeHubApi[K]>[0]
): Promise<Awaited<ReturnType<CodeHubApi[K]>>> {
  const state = useAppStore.getState()
  const owners = state.repos.filter(
    (repo) =>
      (!args.repoId || repo.id === args.repoId) &&
      repo.path === args.repoPath &&
      (!args.repoHostId || getRepoExecutionHostId(repo) === args.repoHostId)
  )
  if (owners.length !== 1) {
    throw new Error(
      'CodeHub repository owner is missing or ambiguous. Select a host-specific repository.'
    )
  }
  const target = runtimeTargetForOwnerEnvironment(
    getExplicitRuntimeOwnerEnvironmentId({ repos: owners }, owners[0].id)
  )
  if (target.kind === 'environment') {
    return callRuntimeRpc<Awaited<ReturnType<CodeHubApi[K]>>>(target, `codehub.${method}`, args, {
      timeoutMs: 60_000
    })
  }
  const call = window.api.codehub[method] as (
    input: typeof args
  ) => Promise<Awaited<ReturnType<CodeHubApi[K]>>>
  return call(args)
}

export const codehubApi: CodeHubApi = {
  viewer: (args) => route('viewer', args),
  listTasks: (args) => route('listTasks', args),
  createIssue: (args) => route('createIssue', args),
  updateIssueTitle: (args) => route('updateIssueTitle', args),
  updateIssueLabels: (args) => route('updateIssueLabels', args),
  listLabels: (args) => route('listLabels', args),
  listMembers: (args) => route('listMembers', args),
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
