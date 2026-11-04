import type { TaskPageComposerActionsModel } from './use-task-page-composer-actions'
import PullRequestPage from '@/components/PullRequestPage'
import GitHubItemDialog from '@/components/GitHubItemDialog'
import { translate } from '@/i18n/i18n'
import ProjectViewWrapper from '@/components/github-project/ProjectViewWrapper'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'
import { TaskPageGitHubList } from './github/List'
import { TaskPageGitLabTodoList } from './gitlab/TodoList'
import { TaskPageGitLabItemList } from './gitlab/ItemList'
import { TaskPageCodeHubItemList } from './codehub/ItemList'
import { TaskPageCodeHubDetail } from './codehub/Detail'
import { TaskPageJiraContent } from './jira/Content'
export function TaskPageContent({
  model
}: {
  model: TaskPageComposerActionsModel
}): React.JSX.Element | null {
  const {
    repoSelection,
    taskSource,
    githubMode,
    gitlabView,
    dialogInitialTab,
    dialogWorkItem,
    dialogRepoPath,
    dialogSourceContext,
    accountBackedTaskSourceHostId,
    setDialogWorkItem,
    handleDialogReviewRequestsChange,
    closeTaskDetailPage,
    handleUseWorkItem,
    codehubDetailItem
  } = model
  return taskSource === 'github' && dialogWorkItem ? (
    dialogWorkItem.type === 'pr' ? (
      <PullRequestPage
        workItem={dialogWorkItem}
        initialTab={dialogInitialTab}
        repoPath={dialogRepoPath}
        repoId={dialogWorkItem.repoId}
        sourceContext={dialogSourceContext}
        backLabel={translate('auto.components.TaskPage.backToPullRequests', 'Pull requests')}
        onUse={(item) => {
          setDialogWorkItem(null)
          handleUseWorkItem(item)
        }}
        onReviewRequestsChange={handleDialogReviewRequestsChange}
        onClose={closeTaskDetailPage}
      />
    ) : (
      <GitHubItemDialog
        workItem={dialogWorkItem}
        initialTab={dialogInitialTab}
        repoPath={dialogRepoPath}
        repoId={dialogWorkItem.repoId}
        sourceContext={dialogSourceContext}
        backLabel={translate('auto.components.TaskPage.backToGitHubList', 'GitHub list')}
        onUse={(item) => {
          setDialogWorkItem(null)
          handleUseWorkItem(item)
        }}
        onReviewRequestsChange={handleDialogReviewRequestsChange}
        onClose={closeTaskDetailPage}
      />
    )
  ) : taskSource === 'github' && githubMode === 'project' ? (
    isWorkbenchShell() ? (
      <TaskPageGitHubList model={model} />
    ) : (
      <div className="mt-3 flex min-h-0 min-w-0 max-h-full flex-col overflow-hidden rounded-md border border-border/50 bg-muted/50 shadow-sm">
        <ProjectViewWrapper
          selectedRepoIds={repoSelection}
          sourceHostId={accountBackedTaskSourceHostId}
        />
      </div>
    )
  ) : taskSource === 'github' ? (
    // Join the table shell to the filter chrome without a doubled seam.
    <TaskPageGitHubList model={model} />
  ) : taskSource === 'gitlab' && gitlabView === 'todos' ? (
    <TaskPageGitLabTodoList model={model} />
  ) : taskSource === 'gitlab' ? (
    <TaskPageGitLabItemList model={model} />
  ) : taskSource === 'codehub' && codehubDetailItem ? (
    <TaskPageCodeHubDetail model={model} />
  ) : taskSource === 'codehub' ? (
    <TaskPageCodeHubItemList model={model} />
  ) : (
    <TaskPageJiraContent model={model} />
  )
}
