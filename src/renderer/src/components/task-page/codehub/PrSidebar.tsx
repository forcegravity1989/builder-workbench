import { useState } from 'react'
import { GitMerge, GitPullRequest, GitPullRequestClosed, LoaderCircle, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { codehubApi } from '@/lib/codehub-api'
import { GitHubUserAvatar } from '@/components/github/github-user-avatar'
import { TaskPageGitHubWorkItemStateBadge } from '@/components/task-page-github-work-item-status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { CodeHubDetailState } from './use-codehub-detail'

function PeopleList({
  names,
  emptyLabel
}: {
  names: string[]
  emptyLabel: string
}): React.JSX.Element {
  if (names.length === 0) {
    return <div className="text-[12px] text-muted-foreground">{emptyLabel}</div>
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {names.map((name) => (
        <li key={name} className="flex min-w-0 items-center gap-2">
          <GitHubUserAvatar login={name} className="size-6" />
          <span className="min-w-0 truncate text-[13px] font-medium text-foreground">{name}</span>
        </li>
      ))}
    </ul>
  )
}

export function CodeHubPrSidebar({ state }: { state: CodeHubDetailState }): React.JSX.Element {
  const { item, detail, actionItem, reloadDetail } = state
  const [busy, setBusy] = useState<'merge' | 'close' | 'reviewers' | null>(null)
  const [reviewerDraft, setReviewerDraft] = useState('')
  const [reviewersOpen, setReviewersOpen] = useState(false)
  const opened = actionItem.state === 'opened'
  const assignees = detail?.assignees?.length ? detail.assignees : item.assignees
  const reviewers = detail?.reviewers?.length ? detail.reviewers : item.reviewers
  const statusItem = {
    type: 'pr' as const,
    state: actionItem.state === 'opened' ? ('open' as const) : actionItem.state
  }

  const run = async (kind: 'merge' | 'close' | 'reviewers', action: () => Promise<void>): Promise<void> => {
    if (!item.repoPath || busy) {
      return
    }
    setBusy(kind)
    try {
      await action()
      reloadDetail()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex h-fit flex-col gap-5 xl:sticky xl:top-4">
      <aside className="rounded-lg border border-border/50 bg-card/50 p-3 shadow-xs">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <GitPullRequest className="size-3.5 text-muted-foreground" />
            <span className="text-[13px] font-medium text-foreground">
              {translate('auto.components.GitHubItemDialog.a2495e4784', 'Pull request')}
            </span>
          </div>
          <TaskPageGitHubWorkItemStateBadge item={statusItem} />
        </div>
        <div className="grid gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!opened || busy !== null}
            className={cn(
              'w-full justify-center gap-2 bg-green-600 text-white hover:bg-green-700',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
            onClick={() => {
              void run('merge', async () => {
                await codehubApi.mergeMr({
                  repoPath: item.repoPath!,
                  repoId: item.repoId,
                  iid: item.iid
                })
                toast.success(translate('auto.components.TaskPage.codehubMerged', 'Merge requested'))
              })
            }}
          >
            {busy === 'merge' ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <GitMerge className="size-3.5" />
            )}
            {translate('auto.components.TaskPage.codehubMerge', 'Merge')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!opened || busy !== null}
            className="w-full justify-center gap-2 border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
            onClick={() => {
              void run('close', async () => {
                await codehubApi.closeMr({
                  repoPath: item.repoPath!,
                  repoId: item.repoId,
                  iid: item.iid
                })
                toast.success(
                  translate('auto.components.TaskPage.codehubMrClosed', 'Merge request closed')
                )
              })
            }}
          >
            {busy === 'close' ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <GitPullRequestClosed className="size-3.5 text-destructive" />
            )}
            {translate('auto.components.GitHubItemDialog.21860b58d0', 'Close pull request')}
          </Button>
        </div>
      </aside>
      <section>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          {translate('auto.components.GitHubItemDialog.83ac703dda', 'Assignees')}
        </div>
        <PeopleList
          names={assignees}
          emptyLabel={translate('auto.components.GitHubItemDialog.c67de9e2fe', 'No one assigned')}
        />
      </section>
      <section>
        <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          <span>{translate('auto.components.GitHubItemDialog.dc8a092c57', 'Reviewers')}</span>
          <Popover open={reviewersOpen} onOpenChange={setReviewersOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={!opened || busy !== null}
                aria-label={translate('auto.components.GitHubItemDialog.934add88b6', 'Reviewer')}
                className="rounded p-0.5 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {busy === 'reviewers' ? (
                  <LoaderCircle className="size-3 animate-spin" />
                ) : (
                  <Pencil className="size-3" />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[330px] p-2" align="end">
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  const names = reviewerDraft
                    .split(',')
                    .map((name) => name.trim())
                    .filter(Boolean)
                  if (!item.repoPath || names.length === 0) {
                    return
                  }
                  void run('reviewers', async () => {
                    await codehubApi.setReviewers({
                      repoPath: item.repoPath!,
                      repoId: item.repoId,
                      iid: item.iid,
                      reviewers: names
                    })
                    setReviewerDraft('')
                    setReviewersOpen(false)
                    toast.success(
                      translate('auto.components.TaskPage.codehubReviewersSet', 'Reviewers updated')
                    )
                  })
                }}
              >
                <Input
                  value={reviewerDraft}
                  onChange={(event) => setReviewerDraft(event.target.value)}
                  placeholder={translate(
                    'auto.components.GitHubItemDialog.bb42774171',
                    'Type or choose a user'
                  )}
                  aria-label={translate('auto.components.GitHubItemDialog.934add88b6', 'Reviewer')}
                  className="h-8 text-xs"
                />
              </form>
            </PopoverContent>
          </Popover>
        </div>
        <PeopleList
          names={reviewers}
          emptyLabel={translate('auto.components.GitHubItemDialog.c67de9e2fe', 'No one assigned')}
        />
      </section>
    </div>
  )
}
