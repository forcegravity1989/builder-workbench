import { createTaskPageCodeHubApi } from '@/lib/codehub-api'
import { runIssueUpdate } from '@/components/github/github-work-item-edit-mutations'
import type { Repo } from '../../../shared/repository/repo-types'
import type { TaskSourceContext } from '../../../shared/work-items/task-source-context'
import {
  githubIssueAssignmentTarget,
  nextIssueVersionMembership
} from '../../../shared/workbench/version-membership'

export class IssueAssignmentError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'IssueAssignmentError'
  }
}

export type IssueAssignmentResult = {
  title: string
  titleChanged: boolean
  labelAdded: boolean
}

/**
 * 先写计划标签（只追加），再改标题。标签没写上时标题保持不动，避免只改标题、丢掉旧版本标签。
 */
export async function writeIssueVersionAssignment(args: {
  provider: 'github' | 'codehub'
  repo: Repo
  source: TaskSourceContext
  number: number
  url?: string
  title: string
  labels?: readonly string[] | null
  version: string
  goalId: string
}): Promise<IssueAssignmentResult> {
  const next = nextIssueVersionMembership(args)
  const result: IssueAssignmentResult = {
    title: next.title,
    titleChanged: next.titleChanged,
    labelAdded: next.addedLabel !== null
  }
  if (!result.titleChanged && !result.labelAdded) {
    return result
  }
  if (!args.repo.path) {
    throw new IssueAssignmentError('项目路径还不可用，无法更新 Issue')
  }
  if (args.provider === 'github') {
    const repository = githubIssueAssignmentTarget(args.url ?? '', args.number, [args.repo])
    if (!repository) {
      throw new IssueAssignmentError('没有读回 Issue 所在仓库，不能改标题和计划标签')
    }
    try {
      await runIssueUpdate({
        repoPath: args.repo.path,
        repoId: args.repo.id,
        sourceContext: args.source,
        projectOrigin: undefined,
        issueRepo: repository,
        number: args.number,
        updates: {
          ...(result.titleChanged ? { title: next.title } : {}),
          ...(next.addedLabel ? { addLabels: [next.addedLabel] } : {})
        }
      })
    } catch (reason) {
      throw new IssueAssignmentError('Issue 标题和计划标签没有更新', { cause: reason })
    }
    return result
  }
  const identity = args.source.providerIdentity
  const api = createTaskPageCodeHubApi(
    args.source.provider === 'codehub' ? args.source : null,
    identity?.provider === 'codehub'
      ? { host: identity.host, project: identity.project }
      : undefined
  )
  const request = {
    repoPath: args.repo.path,
    repoId: args.repo.id,
    iid: args.number
  }
  if (result.labelAdded && next.addedLabel) {
    try {
      await api.updateIssueLabels({ ...request, labels: [next.addedLabel], append: true })
      const fresh = await api.viewTask({
        repoPath: request.repoPath,
        repoId: request.repoId,
        iid: args.number,
        kind: 'issue',
        ...(args.url ? { expectedUrl: args.url } : {})
      })
      if (!fresh.labels?.includes(next.addedLabel)) {
        throw new Error('计划标签没有出现在读回结果里')
      }
    } catch (reason) {
      throw new IssueAssignmentError('计划标签没有加上，Issue 标题未改', { cause: reason })
    }
  }
  if (result.titleChanged) {
    try {
      await api.updateIssueTitle({ ...request, title: next.title })
    } catch (reason) {
      throw new IssueAssignmentError(
        result.labelAdded
          ? '计划标签已加上，标题没有改成当前版本和目标'
          : 'Issue 标题没有改成当前版本和目标',
        { cause: reason }
      )
    }
  }
  return result
}
