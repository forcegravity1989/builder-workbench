import { parseWslPath } from '../wsl'
import {
  getOwnerRepo,
  ghExecFileAsync,
  ghRepoExecOptions,
  githubRepoContext
} from '../github/gh-utils'
import { githubHostExecOptions } from '../github/github-api-repository'
import { noteRepositoryRateLimitSpend, repositoryRateLimitGuard } from '../github/rate-limit'
import { isCodeHubGitRemote, parseCodeHubRemote } from '../../shared/codehub'
import { listCodeHubComments } from '../codehub/comments'
import type { WorkflowCommentsRequest } from '../../shared/workbench/workflow-comments'
import type {
  WorkflowCommentsResult,
  WorkflowSourceComment
} from '../../shared/workbench/workflow-report'
import { githubRepositoryMatches, codeHubRepositoryMatches } from './archive-pr-status'
import { createWorkbenchRepoResolver, nativeWorkbenchWorkspaceHost } from './workspace-resolver'

/** Workflow needs complete conversation reads; partial general-review results are insufficient. */
export async function readWorkflowComments(
  runtime: Parameters<typeof nativeWorkbenchWorkspaceHost>[0],
  params: WorkflowCommentsRequest
): Promise<WorkflowCommentsResult> {
  const resolver = createWorkbenchRepoResolver(nativeWorkbenchWorkspaceHost(runtime))
  const { repo } = resolver.resolveRepo({
    repoId: params.repoId,
    hostId: params.hostId
  })
  const local = repo.connectionId
    ? {}
    : {
        cwd: repo.path,
        ...(parseWslPath(repo.path)?.distro ? { wslDistro: parseWslPath(repo.path)!.distro } : {})
      }
  const remote = isCodeHubGitRemote(repo.gitRemoteIdentity)
    ? (parseCodeHubRemote(repo.gitRemoteIdentity?.remoteUrl) ??
      parseCodeHubRemote(repo.gitRemoteIdentity?.canonicalKey))
    : null
  if (params.pr.provider === 'codehub' && remote) {
    if (repo.connectionId) {
      throw new Error('此 CodeHub 项目的 SSH 评论读取尚未接入，请使用项目所属 runtime')
    }
    if (!codeHubRepositoryMatches(params.pr.repository, remote)) {
      throw new Error('指标 MR 与项目 CodeHub 来源不一致')
    }
    const notes = await listCodeHubComments({
      remote,
      execOptions: local,
      kind: 'mr',
      iid: params.pr.number,
      requireComplete: true
    })
    return {
      comments: notes.map((note) => ({ id: note.id, body: note.body, createdAt: note.createdAt })),
      checkedAt: new Date().toISOString()
    }
  }
  if (params.pr.provider !== 'github' || remote) {
    throw new Error('此来源的指标评论尚不可读')
  }
  const gitOptions = repo.connectionId
    ? {}
    : parseWslPath(repo.path)?.distro
      ? { wslDistro: parseWslPath(repo.path)!.distro }
      : {}
  const owner = await getOwnerRepo(repo.path, repo.connectionId, gitOptions)
  if (!owner || !githubRepositoryMatches(params.pr.repository, owner)) {
    throw new Error('指标 PR 与项目 GitHub 来源不一致')
  }
  const options = {
    ...ghRepoExecOptions(githubRepoContext(repo.path, repo.connectionId, gitOptions)),
    ...githubHostExecOptions(owner)
  }
  if (repositoryRateLimitGuard(owner, 'core', options).blocked) {
    throw new Error('GitHub速率限制中，指标评论读取未知')
  }
  noteRepositoryRateLimitSpend(owner, 'core', 1, options)
  const { stdout } = await ghExecFileAsync(
    [
      'api',
      '--paginate',
      '--slurp',
      `repos/${owner.owner}/${owner.repo}/issues/${params.pr.number}/comments?per_page=100`
    ],
    options
  )
  const pages: unknown = JSON.parse(stdout)
  if (!Array.isArray(pages) || !pages.every(Array.isArray)) {
    throw new Error('指标评论分页格式未识别')
  }
  if (pages.length > 1) {
    noteRepositoryRateLimitSpend(owner, 'core', pages.length - 1, options)
  }
  const comments: WorkflowSourceComment[] = pages.flat().map((row: unknown) => {
    if (
      !row ||
      typeof row !== 'object' ||
      !('id' in row) ||
      !('body' in row) ||
      typeof row.body !== 'string' ||
      !('html_url' in row) ||
      typeof row.html_url !== 'string'
    ) {
      throw new Error('指标评论记录不完整')
    }
    return {
      id: String(row.id),
      body: row.body,
      url: row.html_url,
      createdAt:
        'created_at' in row && typeof row.created_at === 'string' ? row.created_at : undefined
    }
  })
  return { comments, checkedAt: new Date().toISOString() }
}
