import { ghExecFileAsync } from '../github/gh-utils'
import { noteRepositoryRateLimitSpend, repositoryRateLimitGuard } from '../github/rate-limit'
import { listCodeHubComments } from '../codehub/comments'
import type { WorkflowCommentsRequest } from '../../shared/workbench/workflow-comments'
import type {
  WorkflowCommentsResult,
  WorkflowSourceComment
} from '../../shared/workbench/workflow-report'
import { codeHubRepositoryMatches } from './archive-pr-status'
import { resolveCodeHubRepositoryIdentity } from '../codehub/web-identity'
import type { nativeWorkbenchWorkspaceHost } from './workspace-resolver'
import {
  overviewProviderContext,
  overviewGitHubContext,
  withOverviewReadPermit
} from './overview-provider-context'

/** Workflow needs complete conversation reads; partial general-review results are insufficient. */
export async function readWorkflowComments(
  runtime: Parameters<typeof nativeWorkbenchWorkspaceHost>[0],
  params: WorkflowCommentsRequest
): Promise<WorkflowCommentsResult> {
  const context = overviewProviderContext(runtime, params)
  const { repo, local, remote } = context
  if (params.pr.provider === 'codehub' && remote) {
    if (repo.connectionId) {
      throw new Error('此 CodeHub 项目的 SSH 评论读取尚未接入，请使用项目所属 runtime')
    }
    const identity = await resolveCodeHubRepositoryIdentity(remote, params.pr.repository, local)
    if (!codeHubRepositoryMatches(params.pr.repository, identity)) {
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
  const { owner, options } = await overviewGitHubContext(context, params)
  if (repositoryRateLimitGuard(owner, 'core', options).blocked) {
    throw new Error('GitHub速率限制中，指标评论读取未知')
  }
  noteRepositoryRateLimitSpend(owner, 'core', 1, options)
  const { stdout } = await withOverviewReadPermit(() =>
    ghExecFileAsync(
      [
        'api',
        '--paginate',
        '--slurp',
        `repos/${owner.owner}/${owner.repo}/issues/${params.pr.number}/comments?per_page=100`
      ],
      options
    )
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
