import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import {
  getGitHubRuntimeRepoId,
  getGitHubSourceRuntimeTarget
} from '@/lib/github-source-runtime-context'
import type { PRComment } from '../../../../shared/github/comment-types'
import { lookupGitHubWorkItemForSource } from '@/lib/github-work-item-source-lookup'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import type { Repo } from '../../../../shared/repo-types'
import {
  hasReviewProject,
  type ReviewRepoIdentity
} from '../../../../shared/workbench/pr-review-request'
import { requireSourceContext } from '../task-reference-repo'
import { countUnresolvedReviewCommentsSince, type ReviewReadback } from './model'

export function findRegisteredReviewRepo(
  identity: ReviewRepoIdentity,
  repos: readonly Repo[] = useAppStore.getState().repos
): Repo | null {
  const matches = repos.filter((repo) => repo.path && hasReviewProject([repo], identity))
  return (
    matches.find((repo) => getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID) ??
    matches[0] ??
    null
  )
}

/** 只接受完整的检视线程读回；失败由通知显示为未知。 */
export async function readReviewTracking(
  repo: Repo,
  prNumber: number,
  roundStartedAt: string
): Promise<ReviewReadback> {
  const sourceContext = requireSourceContext(repo, 'github')
  const item = await lookupGitHubWorkItemForSource({
    repoPath: repo.path,
    repoId: repo.id,
    sourceContext,
    number: prNumber,
    type: 'pr'
  })
  if (!item) {
    throw new Error(`GitHub 未返回 PR #${prNumber}`)
  }
  const checkedAt = new Date().toISOString()
  const result = await callRuntimeRpc<{ complete: boolean; comments: PRComment[] }>(
    getGitHubSourceRuntimeTarget(sourceContext),
    'workbench.review.comments',
    { repo: getGitHubRuntimeRepoId(sourceContext, repo.id), prNumber, noCache: true },
    { timeoutMs: 30_000 }
  )
  if (!result.complete) {
    throw new Error('此主机无法确认检视线程完整性')
  }
  const openCommentCount = countUnresolvedReviewCommentsSince(result.comments, roundStartedAt)
  if (openCommentCount === null) {
    throw new Error('检视线程数据不完整，意见数未知')
  }
  return {
    merged: item.state === 'merged' || Boolean(item.mergedAt),
    openCommentCount,
    prState: item.state,
    // Why: ProviderCheckSummary 用 none 表示「没有 checks」，与没读到一样不显示徽标。
    checksState:
      item.checksSummary?.state && item.checksSummary.state !== 'none'
        ? item.checksSummary.state
        : null,
    checkedAt
  }
}

export async function openReviewPr(identity: ReviewRepoIdentity, prNumber: number): Promise<void> {
  const repo = findRegisteredReviewRepo(identity)
  if (!repo) {
    toast.error(`本机没有接入项目 ${identity.owner}/${identity.name}，无法进入 PR #${prNumber}`)
    return
  }
  try {
    const sourceContext = requireSourceContext(repo, 'github')
    const item = await lookupGitHubWorkItemForSource({
      repoPath: repo.path,
      repoId: repo.id,
      sourceContext,
      number: prNumber,
      type: 'pr'
    })
    if (!item) {
      toast.error(`GitHub 未返回 PR #${prNumber}，无法打开详情`)
      return
    }
    useAppStore.getState().openTaskPage(
      {
        taskSource: 'github',
        preselectedRepoId: repo.id,
        openGitHubWorkItem: item,
        openGitHubSourceContext: sourceContext
      },
      { recordTasksInteraction: false, returnToPreviousView: true }
    )
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
}
