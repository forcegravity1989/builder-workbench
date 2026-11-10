import { countUnresolvedCodeHubThreadsSince } from '../../../../shared/workbench/review-thread-counts'
import { createCodeHubApi } from '@/lib/codehub-api'
import { prefillCodehubDetailCache } from '@/components/task-page/codehub/codehub-detail-cache'
import { useAppStore } from '@/store'
import type { Repo } from '../../../../shared/repo-types'
import type { CodeHubTaskDetail } from '../../../../shared/codehub-tasks'
import { summarizeProviderChecks } from '../../../../shared/provider-check-summary'
import {
  reviewRepoIdentity,
  type ReviewSendInput
} from '../../../../shared/workbench/pr-review-request'
import { requireSourceContext } from '../task-reference-repo'
import { codeHubTaskItemFromDetail } from '../codehub-task-item'
import type { ReviewReadback, ReviewPrState } from './model'

function mrState(detail: CodeHubTaskDetail): ReviewPrState {
  const state = detail.state.trim().toLowerCase()
  if (state === 'opened' || state === 'open') {
    return 'open'
  }
  if (state === 'closed' || state === 'merged') {
    return state
  }
  throw new Error('CodeHub 未返回可确认的 MR 状态')
}

export async function resolveCodeHubReviewTarget(
  repo: Repo,
  branch: string,
  linkedMR?: number | null
): Promise<ReviewSendInput | null> {
  const identity = reviewRepoIdentity(repo)
  if (!identity) {
    throw new Error('无法识别项目远端')
  }
  const api = createCodeHubApi(requireSourceContext(repo, 'codehub'))
  const args = { repoPath: repo.path, repoId: repo.id }
  const number = linkedMR ?? (await api.mrForBranch({ ...args, sourceBranch: branch }))?.number
  if (!number) {
    return null
  }
  const detail = await api.viewTask({ ...args, kind: 'mr', iid: number })
  const state = mrState(detail)
  if (state !== 'open') {
    throw new Error(state === 'merged' ? 'MR 已合入' : 'MR 已关闭')
  }
  if (detail.sourceBranch !== branch || !detail.targetBranch) {
    throw new Error('关联 MR 的来源或目标分支无法确认')
  }
  return {
    repo: identity,
    prNumber: number,
    title: detail.title,
    sourceBranch: detail.sourceBranch,
    targetBranch: detail.targetBranch
  }
}

export async function readCodeHubReviewTracking(
  repo: Repo,
  number: number,
  since: string
): Promise<ReviewReadback> {
  const api = createCodeHubApi(requireSourceContext(repo, 'codehub'))
  const args = { repoPath: repo.path, repoId: repo.id, kind: 'mr' as const, iid: number }
  const [detail, comments, checks] = await Promise.all([
    api.viewTask(args),
    api.listComments({ ...args, requireCompleteThreads: true }),
    api.mrChecks(args)
  ])
  const openCommentCount = countUnresolvedCodeHubThreadsSince(comments, since)
  if (openCommentCount === null) {
    throw new Error('CodeHub 检视线程数据不完整，意见数未知')
  }
  const state = mrState(detail)
  const summary = summarizeProviderChecks(checks)
  return {
    merged: state === 'merged',
    prState: state,
    openCommentCount,
    checksState: summary.state === 'none' ? null : summary.state,
    checkedAt: new Date().toISOString()
  }
}

export async function openCodeHubReview(repo: Repo, number: number): Promise<void> {
  const sourceContext = requireSourceContext(repo, 'codehub')
  const detail = await createCodeHubApi(sourceContext).viewTask({
    repoPath: repo.path,
    repoId: repo.id,
    kind: 'mr',
    iid: number
  })
  mrState(detail)
  const item = codeHubTaskItemFromDetail({ repo, kind: 'mr', detail })
  prefillCodehubDetailCache({ repoId: repo.id, kind: 'mr', iid: number, sourceContext }, detail)
  useAppStore.getState().openTaskPage(
    {
      taskSource: 'codehub',
      preselectedRepoId: repo.id,
      openCodeHubTask: item,
      openCodeHubSourceContext: sourceContext
    },
    { recordTasksInteraction: false, returnToPreviousView: true }
  )
}
