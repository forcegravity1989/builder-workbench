import { getTaskPageRepoSourceContext } from '@/lib/work-items/task-repo-source-context'
import {
  getGitHubRuntimeRepoId,
  getGitHubSourceRuntimeTarget
} from '@/lib/work-items/github/github-source-runtime-context'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import { getCodeHubRepoSourceContext } from '@/lib/codehub-api'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host/execution-host'
import type { GitHubViewer } from '../../../shared/github/pull-requests/pull-request-types'
import { parseGitHubIssueOrPRLink } from '../../../shared/github/repositories/links'
import type { GitHubWorkItem } from '../../../shared/github/work-items/work-item-types'
import type { Repo } from '../../../shared/repository/repo-types'
import type { TaskSourceContext } from '../../../shared/work-items/task-source-context'

export function getRepoTaskSourceContext(
  repo: Repo | null | undefined,
  provider: 'github' | 'gitlab' | 'codehub'
): TaskSourceContext | null {
  return provider === 'codehub'
    ? getCodeHubRepoSourceContext(repo)
    : getTaskPageRepoSourceContext(repo, provider)
}

export function getTaskPageGitHubItemSource(
  repo: Repo | null | undefined,
  item: Pick<GitHubWorkItem, 'type' | 'number' | 'url' | 'prRepo'>,
  previous?: TaskSourceContext | null
): TaskSourceContext | null {
  const context = getTaskPageRepoSourceContext(repo, 'github')
  if (!isWorkbenchShell()) {
    return previous ?? context
  }
  const source = context ?? previous
  if (!source) {
    return null
  }
  const fromUrl = parseGitHubIssueOrPRLink(item.url ?? '')?.slug
  const identity = item.prRepo
    ? { ...item.prRepo, host: item.prRepo.host ?? fromUrl?.host }
    : fromUrl
  return {
    ...source,
    hostId: LOCAL_EXECUTION_HOST_ID,
    localTaskAccount: true,
    taskRemoteCandidates: undefined,
    providerIdentity: identity
      ? { provider: 'github', ...identity }
      : (previous?.providerIdentity ?? source.providerIdentity)
  }
}

export async function lookupGitHubViewerForSource(args: {
  repoId: string
  repoPath: string
  sourceContext?: TaskSourceContext | null
}): Promise<GitHubViewer | null> {
  if (!args.sourceContext) {
    throw new Error('GitHub repository source is unavailable')
  }
  const target = getGitHubSourceRuntimeTarget(args.sourceContext)
  return target.kind === 'environment'
    ? callRuntimeRpc<GitHubViewer | null>(
        target,
        'github.repoViewer',
        { repo: getGitHubRuntimeRepoId(args.sourceContext, args.repoId) },
        { timeoutMs: 30_000 }
      )
    : window.api.gh.repoViewer({
        repoPath: args.repoPath,
        repoId: args.repoId,
        sourceContext: args.sourceContext
      })
}
