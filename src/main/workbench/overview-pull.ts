import { ghExecFileAsync } from '../github/gh-utils'
import { repositoryRateLimitGuard, noteRepositoryRateLimitSpend } from '../github/rate-limit'
import { OverviewPullSchema } from '../../shared/workbench/overview-pull'
import type { WorkflowCommentsRequest } from '../../shared/workbench/workflow-comments'
import type { nativeWorkbenchWorkspaceHost } from './workspace-resolver'
import {
  overviewProviderContext,
  overviewGitHubContext,
  withOverviewReadPermit
} from './overview-provider-context'

const timestamp = (value: unknown) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : undefined

export async function readOverviewPull(
  runtime: Parameters<typeof nativeWorkbenchWorkspaceHost>[0],
  params: WorkflowCommentsRequest
) {
  const { owner, options } = await overviewGitHubContext(
    overviewProviderContext(runtime, params),
    params
  )
  if (repositoryRateLimitGuard(owner, 'core', options).blocked) {
    throw new Error('GitHub速率限制中，PR来源未知')
  }
  noteRepositoryRateLimitSpend(owner, 'core', 1, options)
  const { stdout } = await withOverviewReadPermit(() =>
    ghExecFileAsync(['api', `repos/${owner.owner}/${owner.repo}/pulls/${params.pr.number}`], {
      ...options,
      timeout: 30_000
    })
  )
  const row = JSON.parse(stdout)
  const expected = `https://${owner.host || 'github.com'}/${owner.owner}/${owner.repo}/pull/${params.pr.number}`
  if (
    !row ||
    typeof row !== 'object' ||
    row.number !== params.pr.number ||
    typeof row.html_url !== 'string' ||
    row.html_url.replace(/\/$/, '').toLowerCase() !== expected.toLowerCase() ||
    !['open', 'closed'].includes(row.state) ||
    (typeof row.body !== 'string' && row.body !== null)
  ) {
    throw new Error('PR 来源、正文或状态未完整返回')
  }
  const mergedAt = timestamp(row.merged_at)
  return OverviewPullSchema.parse({
    number: row.number,
    url: row.html_url,
    title: row.title,
    body: row.body ?? '',
    state:
      row.merged === true || mergedAt
        ? 'merged'
        : row.state === 'closed'
          ? 'closed'
          : row.draft
            ? 'draft'
            : 'open',
    createdAt: timestamp(row.created_at),
    mergedAt,
    revision: typeof row.head?.sha === 'string' ? row.head.sha : undefined,
    readAt: new Date().toISOString()
  })
}
