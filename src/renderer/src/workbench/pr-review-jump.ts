/**
 * 评审消息 → 任务屏 PR 详情页（pr-review-notify 共用跳转协议的方案一入口）。
 * 与 task-port openDetail 同一读回链路（定位登记项目 → 按编号读工作项 →
 * openTaskPage 落 PullRequestPage）；未接入/读不到如实提示，不猜、不自动导航。
 */
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { lookupGitHubWorkItemForSource } from '@/lib/github-work-item-source-lookup'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { parseReviewMessage } from '../../../shared/workbench/pr-review-message'
import { requireSourceContext, resolveReferenceRepo } from './task-reference-repo'

/**
 * 点击评审消息尝试进入 PR 详情。返回 false＝不是评审消息（按普通文本处理）；
 * true＝是评审消息（无论跳成与否，点击已被消费）。
 */
export async function openPrReviewFromMessage(text: string): Promise<boolean> {
  const payload = parseReviewMessage(text)
  if (!payload) {
    return false
  }
  const repo = resolveReferenceRepo(
    { repos: () => useAppStore.getState().repos },
    // 评审消息不携带来源屏上下文：不做 repoId tie-break，本地宿主优先、取首个匹配。
    // repository 补 host 前缀对齐登记项目的 canonicalKey 形态（github.com/owner/name），
    // 否则两段式 owner/name 过不了 exactIdentityMatch。
    { repoId: '', hostId: LOCAL_EXECUTION_HOST_ID },
    { provider: 'github', repository: `github.com/${payload.repo}`, number: payload.prNumber }
  )
  if (!repo) {
    toast.error(`本机没有接入项目 ${payload.repo}，无法进入 PR #${payload.prNumber}`)
    return true
  }
  try {
    const sourceContext = requireSourceContext(repo, 'github')
    const item = await lookupGitHubWorkItemForSource({
      repoPath: repo.path,
      repoId: repo.id,
      sourceContext,
      number: payload.prNumber,
      type: 'pr'
    })
    if (!item) {
      toast.error(`GitHub 未返回 PR #${payload.prNumber}，无法打开详情`)
      return true
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
    return true
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
    return true
  }
}
