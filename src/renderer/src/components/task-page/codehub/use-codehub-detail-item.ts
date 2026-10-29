import { useCallback } from 'react'
import { useAppStore } from '@/store'
import type { CodeHubTaskItem } from '../../../../../shared/codehub-tasks'
import { getTaskPageRepoSourceContext } from '../../task-page-source-context'
import type { TaskPageSourceAvailabilityModel } from '../../use-task-page-source-availability'
import { findCodeHubTaskRepo } from '@/lib/codehub-task-repo'

/**
 * The CodeHub detail lives in taskPageData (not local state) so external opens —
 * deep links and other screens — replay through the shared nav
 * history like every other provider's detail entry.
 */
export function useCodeHubDetailItem(model: TaskPageSourceAvailabilityModel) {
  const { pageData, selectedRepos, openTaskPage } = model
  const codehubDetailItem = pageData.openCodeHubTask ?? null
  const setCodehubDetailItem = useCallback(
    (item: CodeHubTaskItem | null) => {
      if (item) {
        const state = useAppStore.getState()
        const repo =
          findCodeHubTaskRepo(selectedRepos, item) ?? findCodeHubTaskRepo(state.repos, item)
        // Why: a BW workbench scope must survive the detail round-trip so the
        // close path restores the scoped list, matching the GitHub detail flow.
        const workbenchTaskScope = state.taskPageData.workbenchTaskScope ?? null
        openTaskPage(
          {
            taskSource: 'codehub',
            preselectedRepoId: item.repoId,
            ...(workbenchTaskScope ? { workbenchTaskScope } : {}),
            openCodeHubTask: item,
            openCodeHubSourceContext: getTaskPageRepoSourceContext(repo, 'codehub')
          },
          { recordTasksInteraction: false }
        )
        return
      }
      const state = useAppStore.getState()
      const current = state.worktreeNavHistory[state.worktreeNavHistoryIndex]
      if (
        typeof current === 'object' &&
        current.kind === 'task-detail' &&
        state.worktreeNavHistoryIndex > 0
      ) {
        state.goBackWorktree()
        return
      }
      useAppStore.setState({
        taskPageData: {
          ...state.taskPageData,
          openCodeHubTask: undefined,
          openCodeHubSourceContext: undefined
        }
      })
    },
    [openTaskPage, selectedRepos]
  )
  return { codehubDetailItem, setCodehubDetailItem }
}
