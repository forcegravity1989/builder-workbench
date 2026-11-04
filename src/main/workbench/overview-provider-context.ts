import { parseWslPath } from '../wsl'
import { acquire, release, ghRepoExecOptions, githubRepoContext } from '../github/gh-utils'
import {
  githubHostExecOptions,
  resolveGitHubApiRepositoryCandidates
} from '../github/github-api-repository'
import { isCodeHubGitRemote, parseCodeHubRemote } from '../../shared/codehub'
import { githubRepositoryMatches } from './archive-pr-status'
import { createWorkbenchRepoResolver, nativeWorkbenchWorkspaceHost } from './workspace-resolver'
import type { WorkflowCommentsRequest } from '../../shared/workbench/workflow-comments'

export async function withOverviewReadPermit<T>(read: () => Promise<T>): Promise<T> {
  await acquire()
  try {
    return await read()
  } finally {
    release()
  }
}

export function overviewProviderContext(
  runtime: Parameters<typeof nativeWorkbenchWorkspaceHost>[0],
  params: WorkflowCommentsRequest
) {
  const { repo } = createWorkbenchRepoResolver(nativeWorkbenchWorkspaceHost(runtime)).resolveRepo(
    params
  )
  const gitOptions =
    !repo.connectionId && parseWslPath(repo.path)?.distro
      ? { wslDistro: parseWslPath(repo.path)!.distro }
      : {}
  return {
    repo,
    gitOptions,
    local: repo.connectionId ? {} : { cwd: repo.path, ...gitOptions },
    remote: isCodeHubGitRemote(repo.gitRemoteIdentity)
      ? (parseCodeHubRemote(repo.gitRemoteIdentity?.remoteUrl) ??
        parseCodeHubRemote(repo.gitRemoteIdentity?.canonicalKey))
      : null
  }
}

export async function overviewGitHubContext(
  context: ReturnType<typeof overviewProviderContext>,
  params: WorkflowCommentsRequest
) {
  const { repo, gitOptions, remote } = context
  if (params.pr.provider !== 'github' || remote) {
    throw new Error('此来源尚不可通过 GitHub 读取')
  }
  const { candidates } = await resolveGitHubApiRepositoryCandidates(
    repo.path,
    repo.connectionId,
    gitOptions
  )
  const owner = candidates.find((candidate) =>
    githubRepositoryMatches(params.pr.repository, candidate)
  )
  if (!owner || !githubRepositoryMatches(params.pr.repository, owner)) {
    throw new Error('PR 与项目 GitHub 来源不一致')
  }
  return {
    owner,
    options: {
      ...ghRepoExecOptions(githubRepoContext(repo.path, repo.connectionId, gitOptions)),
      ...githubHostExecOptions(owner)
    }
  }
}
