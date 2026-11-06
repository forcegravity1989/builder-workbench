/**
 * 评审通知 → 本机登记项目 / 原生 PR 详情。定位只按仓库身份与编号，
 * 未接入或读不到时如实提示，不猜、不开空白页（spec 进入 PR 详情）。
 */
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { lookupGitHubWorkItemForSource } from '@/lib/github-work-item-source-lookup'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import type { Repo } from '../../../../shared/repo-types'
import type { ReviewRepoIdentity } from '../../../../shared/workbench/pr-review-request'
import { resolveReferenceRepo, requireSourceContext } from '../task-reference-repo'
import { countUnresolvedReviewCommentsSince, type ReviewReadback } from './model'

export function findRegisteredReviewRepo(
  identity: ReviewRepoIdentity,
  prNumber: number,
  repos: readonly Repo[] = useAppStore.getState().repos
): Repo | null {
  const host = identity.host ?? 'github.com'
  return resolveReferenceRepo(
    { repos: () => repos.slice() },
    // 通知不携带来源屏上下文：本地宿主优先，取首个匹配。
    { repoId: '', hostId: LOCAL_EXECUTION_HOST_ID },
    {
      provider: 'github',
      repository: `${host}/${identity.owner}/${identity.name}`,
      number: prNumber
    }
  )
}

/** 读回 PR 合入事实与本轮未解决检视意见数；读不到的部分保持 null。 */
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
  let openCommentCount: number | null = null
  try {
    const comments = await window.api.gh.prComments({
      repoPath: repo.path,
      repoId: repo.id,
      sourceContext,
      prNumber,
      noCache: true
    })
    openCommentCount = countUnresolvedReviewCommentsSince(comments, roundStartedAt)
  } catch {
    // Why: 合入事实已经读到就保留；意见数读不到按未知呈现，不当作 0。
    openCommentCount = null
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
  const repo = findRegisteredReviewRepo(identity, prNumber)
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
