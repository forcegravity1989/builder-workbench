import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import type { CodeHubPipeline, CodeHubTaskItem } from '../../../../../shared/codehub-tasks'

function repoArgs(item: CodeHubTaskItem): { repoPath: string; repoId?: string } | null {
  if (!item.repoPath) {
    return null
  }
  return { repoPath: item.repoPath, repoId: item.repoId }
}

export function TaskPageCodeHubActions({
  item,
  onChanged
}: {
  item: CodeHubTaskItem
  onChanged: () => void
}): React.JSX.Element {
  const [assignee, setAssignee] = useState('')
  const [reviewers, setReviewers] = useState('')
  const [pipelines, setPipelines] = useState<CodeHubPipeline[]>([])
  const [pipelineError, setPipelineError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (item.type !== 'mr') {
      return
    }
    const args = repoArgs(item)
    if (!args) {
      return
    }
    let stale = false
    void window.api.codehub
      .listPipelines({ ...args, iid: item.iid })
      .then((rows) => {
        if (!stale) {
          setPipelines(rows)
          setPipelineError(null)
        }
      })
      .catch((error: unknown) => {
        if (!stale) {
          setPipelines([])
          setPipelineError(error instanceof Error ? error.message : String(error))
        }
      })
    return () => {
      stale = true
    }
  }, [item])

  const run = async (action: () => Promise<void>, success: string): Promise<void> => {
    setBusy(true)
    try {
      await action()
      toast.success(success)
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      {item.type === 'issue' ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const args = repoArgs(item)
            const name = assignee.trim()
            if (!args || !name) {
              return
            }
            void run(
              () => window.api.codehub.assignIssue({ ...args, iid: item.iid, assignee: name }),
              translate('auto.components.TaskPage.codehubAssigned', 'Assignee updated')
            )
          }}
        >
          <input
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
            placeholder={translate('auto.components.TaskPage.codehubAssignee', 'Assignee username')}
            className="h-8 rounded-md border border-border/50 bg-background px-2 text-xs"
          />
          <Button type="submit" size="sm" disabled={busy || assignee.trim().length === 0}>
            {translate('auto.components.TaskPage.codehubAssign', 'Assign')}
          </Button>
        </form>
      ) : (
        <>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              const args = repoArgs(item)
              const names = reviewers
                .split(',')
                .map((name) => name.trim())
                .filter(Boolean)
              if (!args || names.length === 0) {
                return
              }
              void run(
                () => window.api.codehub.setReviewers({ ...args, iid: item.iid, reviewers: names }),
                translate('auto.components.TaskPage.codehubReviewersSet', 'Reviewers updated')
              )
            }}
          >
            <input
              value={reviewers}
              onChange={(event) => setReviewers(event.target.value)}
              placeholder={translate(
                'auto.components.TaskPage.codehubReviewers',
                'Reviewers, comma-separated'
              )}
              className="h-8 min-w-56 rounded-md border border-border/50 bg-background px-2 text-xs"
            />
            <Button type="submit" size="sm" disabled={busy || reviewers.trim().length === 0}>
              {translate('auto.components.TaskPage.codehubSetReviewers', 'Set reviewers')}
            </Button>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={busy || item.state !== 'opened'}
              onClick={() => {
                const args = repoArgs(item)
                if (!args) {
                  return
                }
                void run(
                  () => window.api.codehub.mergeMr({ ...args, iid: item.iid }),
                  translate('auto.components.TaskPage.codehubMerged', 'Merge requested')
                )
              }}
            >
              {translate('auto.components.TaskPage.codehubMerge', 'Merge')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || item.state !== 'opened'}
              onClick={() => {
                const args = repoArgs(item)
                if (!args) {
                  return
                }
                void run(
                  () => window.api.codehub.closeMr({ ...args, iid: item.iid }),
                  translate('auto.components.TaskPage.codehubMrClosed', 'Merge request closed')
                )
              }}
            >
              {translate('auto.components.TaskPage.codehubCloseMr', 'Close')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || item.state !== 'opened'}
              onClick={() => {
                const args = repoArgs(item)
                if (!args) {
                  return
                }
                void run(
                  () => window.api.codehub.mergeMr({ ...args, iid: item.iid, auto: true }),
                  translate(
                    'auto.components.TaskPage.codehubAutoMerge',
                    'Merge when the pipeline succeeds'
                  )
                )
              }}
            >
              {translate('auto.components.TaskPage.codehubAutoMergeButton', 'Auto-merge')}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            <div className="font-medium text-foreground">
              {translate('auto.components.TaskPage.codehubChecks', 'Pipelines')}
            </div>
            {pipelineError ? <div className="text-destructive">{pipelineError}</div> : null}
            {pipelines.length === 0 && !pipelineError ? (
              <div>{translate('auto.components.TaskPage.codehubNoPipelines', 'No pipelines')}</div>
            ) : null}
            {pipelines.map((pipeline) => (
              <div key={pipeline.id}>
                {pipeline.status}
                {pipeline.ref ? ` · ${pipeline.ref}` : ''}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
