import type { GitHubWorkItem } from '../../../../shared/github/work-items/work-item-types'
import type { TaskSourceContext } from '../../../../shared/work-items/task-source-context'
import { getGitHubWorkItemWorkspaceSeed } from './task-page-source-context'

export function githubWorkItemWorkspaceComposerData(
  item: GitHubWorkItem,
  taskSourceContext: TaskSourceContext | null | undefined
) {
  return {
    linkedWorkItem: {
      provider: 'github' as const,
      type: item.type,
      number: item.number,
      title: item.title,
      url: item.url,
      ...(item.repoId ? { repoId: item.repoId } : {})
    },
    initialGitHubWorkItem: item,
    taskSourceContext,
    prefilledName: getGitHubWorkItemWorkspaceSeed(item),
    initialRepoId: item.repoId,
    enableIssueAutomation: item.type === 'issue',
    telemetrySource: 'sidebar' as const
  }
}
