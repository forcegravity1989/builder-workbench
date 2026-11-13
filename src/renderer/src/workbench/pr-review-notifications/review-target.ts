import { getTaskPageRepoSourceContext } from '@/components/task-page-source-context'
import { parseGitHubIssueOrPRLink } from '../../../../shared/github/links'
import { githubRepoIdentityKey } from '../../../../shared/github/repository-identity-key'
import type { GitHubOwnerRepo } from '../../../../shared/github/pull-request-types'
import type { TaskSourceContext } from '../../../../shared/task-source-context'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import {
  getGitHubRuntimeRepoId,
  getGitHubSourceRuntimeTarget
} from '@/lib/github-source-runtime-context'
import type { PRComment } from '../../../../shared/github/comment-types'
import { lookupGitHubWorkItemByOwnerRepoForSource } from '@/lib/github-work-item-source-lookup'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import type { Repo } from '../../../../shared/repo-types'
import { isCodeHubGitRemote } from '../../../../shared/codehub'
import { openCodeHubReview, readCodeHubReviewTracking } from './codehub-review'
import {
  hasReviewProject,
  type ReviewRepoIdentity
} from '../../../../shared/workbench/pr-review-request'
import { gitHubIdentityForTaskReference, requireSourceContext } from '../task-reference-repo'
import { countUnresolvedReviewCommentsSince, type ReviewReadback } from './model'

export function findRegisteredReviewRepo(
  identity: ReviewRepoIdentity,
  repos: readonly Repo[] = useAppStore.getState().repos
): Repo | null {
  const key = `${identity.host}/${identity.path}`.toLowerCase()
  const matches = repos.filter((repo) => {
    if (!repo.path) {
      return false
    }
    if (isCodeHubGitRemote(repo.gitRemoteIdentity)) {
      return hasReviewProject([repo], identity)
    }
    const candidate = gitHubIdentityForTaskReference(repo, key)
    return candidate
      ? `${candidate.host ?? 'github.com'}/${candidate.owner}/${candidate.repo}`.toLowerCase() ===
          key
      : hasReviewProject([repo], identity)
  })
  return (
    matches.find((repo) => getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID) ??
    matches[0] ??
    null
  )
}

/** 只接受完整的检视线程读回；失败由通知显示为未知。 */
export async function readReviewTracking(
  repo: Repo,
  identity: ReviewRepoIdentity,
  prNumber: number,
  roundStartedAt: string
): Promise<ReviewReadback> {
  if (isCodeHubGitRemote(repo.gitRemoteIdentity)) {
    return readCodeHubReviewTracking(repo, prNumber, roundStartedAt)
  }
  const sourceContext = requireSourceContext(repo, 'github')
  const prRepo = notificationGitHubRepo(identity)
  const item = await lookupNotifiedGitHubPr(repo, prRepo, prNumber, sourceContext)
  const checkedAt = new Date().toISOString()
  const result = await callRuntimeRpc<{ complete: boolean; comments: PRComment[] }>(
    getGitHubSourceRuntimeTarget(sourceContext),
    'workbench.review.comments',
    { repo: getGitHubRuntimeRepoId(sourceContext, repo.id), prNumber, prRepo, noCache: true },
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

function notificationGitHubRepo(identity: ReviewRepoIdentity): GitHubOwnerRepo {
  const [owner, repo, ...extra] = identity.path.split('/')
  if (!owner || !repo || extra.length) {
    throw new Error('无法识别评审请求中的 GitHub 仓库')
  }
  return { host: identity.host, owner, repo }
}

async function lookupNotifiedGitHubPr(
  repo: Repo,
  prRepo: GitHubOwnerRepo,
  prNumber: number,
  sourceContext: TaskSourceContext
) {
  const item = await lookupGitHubWorkItemByOwnerRepoForSource({
    repoPath: repo.path,
    repoId: repo.id,
    sourceContext,
    ...prRepo,
    number: prNumber,
    type: 'pr'
  })
  const actual = item && parseGitHubIssueOrPRLink(item.url)
  if (
    !item ||
    actual?.type !== 'pr' ||
    actual.number !== prNumber ||
    githubRepoIdentityKey(actual.slug) !== githubRepoIdentityKey(prRepo)
  ) {
    throw new Error(`GitHub 未返回通知指定的 PR #${prNumber}`)
  }
  return item
}

export async function openReviewPr(identity: ReviewRepoIdentity, prNumber: number): Promise<void> {
  const repo = findRegisteredReviewRepo(identity)
  if (!repo) {
    toast.error(`暂时无法访问项目 ${identity.path}，请检查项目接入或主机连接`)
    return
  }
  try {
    if (isCodeHubGitRemote(repo.gitRemoteIdentity)) {
      await openCodeHubReview(repo, prNumber)
      return
    }
    const source = getTaskPageRepoSourceContext(repo, 'github')
    if (!source) {
      throw new Error('无法解析 GitHub 任务来源上下文')
    }
    const prRepo = notificationGitHubRepo(identity)
    const sourceContext = {
      ...source,
      taskRemoteCandidates: undefined,
      providerIdentity: { provider: 'github' as const, ...prRepo }
    }
    const item = await lookupNotifiedGitHubPr(repo, prRepo, prNumber, sourceContext)
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
