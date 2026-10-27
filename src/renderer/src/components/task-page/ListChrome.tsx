import { TaskPageScopeHeader } from '@/workbench/TaskScopePanel'
import { useEffect } from 'react'
import type { TaskPageComposerActionsModel } from '../use-task-page-composer-actions'
import { cn } from '@/lib/utils'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'
import { TaskPageSourceBar } from './SourceBar'
import { AlertCircle } from 'lucide-react'
import { TaskPageGitHubModeControls } from './github/ModeControls'
import { TaskPageProviderFilters } from './ProviderFilters'
export function TaskPageListChrome({
  model
}: {
  model: TaskPageComposerActionsModel
}): React.JSX.Element | null {
  const {
    taskSourceAvailabilityNotice,
    taskPageListChromeHidden,
    githubMode,
    setGithubMode,
    setTaskResumeState
  } = model
  const workbench = isWorkbenchShell()
  // Why: Projects is hidden in the shell, so a resumed project mode would show a view with no way back.
  useEffect(() => {
    if (!workbench || githubMode !== 'project') {
      return
    }
    setGithubMode('items')
    setTaskResumeState({ githubMode: 'items' })
  }, [githubMode, setGithubMode, setTaskResumeState, workbench])
  return (
    <div className={cn('flex-none flex flex-col gap-2', taskPageListChromeHidden && 'hidden')}>
      <section className="flex flex-col gap-2">
        <div className="flex flex-col gap-2">
          {workbench ? null : <TaskPageSourceBar model={model} />}

          {taskSourceAvailabilityNotice ? (
            <div
              role="status"
              className="flex max-w-3xl items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
              title={taskSourceAvailabilityNotice.title}
            >
              <AlertCircle className="size-3.5 flex-none" />
              <span className="min-w-0 truncate">{taskSourceAvailabilityNotice.label}</span>
            </div>
          ) : null}

          {workbench ? null : <TaskPageGitHubModeControls model={model} />}

          <TaskPageProviderFilters model={model} />
          <TaskPageScopeHeader model={model} />
        </div>
      </section>
    </div>
  )
}
