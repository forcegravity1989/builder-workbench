import { getTaskPageRepoSourceContext } from '@/components/task-page-source-context'
import { codehubApi } from '@/lib/codehub-api'
import { lookupGitHubWorkItemForSource } from '@/lib/github-work-item-source-lookup'
import { useAppStore } from '@/store'
import { parseCodeHubRemote } from '../../../../shared/codehub'
import type { CodeHubTaskItem } from '../../../../shared/codehub-tasks'
import type { WorkflowArchivePr } from '../../../../shared/workbench/version-workflow'
import type { CycleScope } from '../version-cycle/ports'
import { codehubStateOf, codehubWebUrl } from '../codehub-task-item'
import { resolveReferenceRepo } from '../task-port'

/**
 * Opens the recorded archive PR/MR on the Orca native PR page (never an
 * external browser), reusing the task-port chain: resolve the registered repo
 * for the material reference, look the work item up as type 'pr' (CodeHub:
 * 'mr' detail), then openTaskPage with returnToPreviousView so the plan stays
 * the Back target. Resolution failures throw — the board surfaces them as an
 * honest notice, with no external-link fallback.
 */
export async function openArchivePrPage(
  scope: CycleScope,
  archivePr: WorkflowArchivePr
): Promise<void> {
  const reference = {
    provider: archivePr.provider,
    repository: archivePr.repository,
    number: archivePr.number
  }
  const repo = resolveReferenceRepo({ repos: () => useAppStore.getState().repos }, scope, reference)
  if (!repo) {
    throw new Error(`未在已登记项目中找到归档仓库 ${archivePr.repository}`)
  }
  const options = { recordTasksInteraction: false, returnToPreviousView: true }
  if (archivePr.provider === 'github') {
    const sourceContext = getTaskPageRepoSourceContext(repo, 'github')
    if (!sourceContext) {
      throw new Error('无法解析 github 任务来源上下文')
    }
    const item = await lookupGitHubWorkItemForSource({
      repoPath: repo.path,
      repoId: repo.id,
      sourceContext,
      number: archivePr.number,
      type: 'pr'
    })
    if (!item) {
      throw new Error(`GitHub 未返回编号 ${archivePr.number} 的 PR，无法打开原生 PR 页`)
    }
    useAppStore.getState().openTaskPage(
      {
        taskSource: 'github',
        preselectedRepoId: repo.id,
        openGitHubWorkItem: { ...item, repoId: repo.id },
        openGitHubSourceContext: sourceContext
      },
      options
    )
    return
  }
  if (archivePr.provider === 'codehub') {
    const sourceContext = getTaskPageRepoSourceContext(repo, 'codehub')
    if (!sourceContext) {
      throw new Error('无法解析 codehub 任务来源上下文')
    }
    const detail = await codehubApi.viewTask({
      repoPath: repo.path,
      repoId: repo.id,
      kind: 'mr',
      iid: archivePr.number
    })
    const remote =
      parseCodeHubRemote(repo.gitRemoteIdentity?.remoteUrl) ??
      parseCodeHubRemote(repo.gitRemoteIdentity?.canonicalKey)
    const url = detail.url ?? codehubWebUrl(repo, 'mr', detail.iid)
    if (!url) {
      throw new Error('CodeHub 未返回该 MR 的链接')
    }
    const item: CodeHubTaskItem = {
      type: 'mr',
      iid: detail.iid,
      title: detail.title,
      state: codehubStateOf(detail.state),
      url,
      author: detail.author,
      assignees: detail.assignees,
      reviewers: detail.reviewers,
      labels: detail.labels,
      sourceBranch: detail.sourceBranch,
      targetBranch: detail.targetBranch,
      updatedAt: '',
      repoId: repo.id,
      repoPath: repo.path,
      ...(remote ? { host: remote.host, project: remote.project } : {})
    }
    useAppStore.getState().openTaskPage(
      {
        taskSource: 'codehub',
        preselectedRepoId: repo.id,
        openCodeHubTask: item,
        openCodeHubSourceContext: sourceContext
      },
      options
    )
    return
  }
  throw new Error(`provider ${archivePr.provider} 尚未接入归档 PR 打开`)
}
