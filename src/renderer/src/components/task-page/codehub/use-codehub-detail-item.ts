import { useCallback } from 'react'
import { useAppStore } from '@/store'
import type { CodeHubTaskRow } from '../../use-task-page-codehub-loading'
import { getCodeHubRepoSourceContext } from '@/lib/codehub-api'
import type { TaskPageRepoSelectionModel } from '../use-task-page-repo-selection'

/**
 * The CodeHub detail lives in taskPageData (not local state) so external opens —
 * deep links and other screens — replay through the shared nav
 * history like every other provider's detail entry.
 */
export function useCodeHubDetailItem(model: Pick<TaskPageRepoSelectionModel, 'pageData' | 'selectedRepos' | 'openTaskPage'>) {
  const { pageData, selectedRepos, openTaskPage } = model
  const codehubDetailItem = pageData.openCodeHubTask ?? null
  const setCodehubDetailItem = useCallback(
    (item: CodeHubTaskRow | null) => {
      if (item) {
        const state = useAppStore.getState()
        const repo =
          selectedRepos.find(
            (candidate) => candidate.id === item.repoId && candidate.path === item.repoPath
          ) ?? state.repos.find((candidate) => candidate.id === item.repoId)
        // Why: a BW workbench scope must survive the detail round-trip so the
        // close path restores the scoped list, matching the GitHub detail flow.
        const workbenchTaskScope = state.taskPageData.workbenchTaskScope ?? null
        openTaskPage(
          {
            taskSource: 'codehub',
            preselectedRepoId: item.repoId,
            ...(workbenchTaskScope ? { workbenchTaskScope } : {}),
            openCodeHubTask: item,
            openCodeHubSourceContext: item.sourceContext ?? getCodeHubRepoSourceContext(repo)
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
