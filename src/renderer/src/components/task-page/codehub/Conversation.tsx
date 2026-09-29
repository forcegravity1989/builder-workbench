import { codehubApi } from '@/lib/codehub-api'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { LoaderCircle, Trash2 } from 'lucide-react'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { formatRelativeTime } from '../../task-page-source-context'
import type { CodeHubDetailState } from './use-codehub-detail'
import { CodeHubPrSidebar } from './PrSidebar'

export function CodeHubConversation({ state }: { state: CodeHubDetailState }) {
  const {
    item,
    detail,
    error,
    commentError,
    comments,
    setComments,
    draft,
    setDraft,
    posting,
    postComment
  } = state
  const thread = (
    <>
      <div className="rounded-lg border border-border/50 bg-card/50 shadow-xs">
        <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2 text-[12px] text-muted-foreground">
          <span className="font-medium text-foreground">
            {detail?.author ||
              item.author ||
              translate('auto.components.GitHubItemDialog.773ff70035', 'unknown')}
          </span>
          <span>
            {translate('auto.components.GitHubItemDialog.8223320f8d', 'updated')}{' '}
            {item.updatedAt ? formatRelativeTime(item.updatedAt) : ''}
          </span>
        </div>
        <div className="px-4 py-4 text-[14px] leading-relaxed text-foreground">
          {error ? <p className="text-destructive">{error}</p> : null}
          {!detail && !error ? (
            <div className="flex items-center justify-center py-5">
              <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : null}
          {detail?.description?.trim() ? (
            <CommentMarkdown
              content={detail.description}
              variant="document"
              className="min-w-0 max-w-full overflow-hidden break-words text-[14px] leading-relaxed [&_a]:break-all [&_code]:break-words [&_pre]:max-w-full"
            />
          ) : detail ? (
            <span className="italic text-muted-foreground">
              {translate('auto.components.GitHubItemDialog.9b9cb55994', 'No description provided.')}
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3 px-4">
        {commentError ? <p className="text-sm text-destructive">{commentError}</p> : null}
        {comments.map((comment) => (
          <div key={comment.id} className="rounded-lg border border-border/50 bg-card/40">
            <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2 text-[12px] text-muted-foreground">
              <span className="font-medium text-foreground">{comment.author ?? ''}</span>
              <span>{comment.createdAt ? formatRelativeTime(comment.createdAt) : ''}</span>
              <button
                type="button"
                className="ml-auto text-muted-foreground hover:text-foreground"
                aria-label={translate(
                  'auto.components.TaskPage.codehubDeleteComment',
                  'Delete comment'
                )}
                onClick={() => {
                  if (!item.repoPath) {
                    return
                  }
                  void codehubApi
                    .deleteComment({
                      repoPath: item.repoPath,
                      repoId: item.repoId,
                      kind: item.type,
                      iid: item.iid,
                      commentId: comment.id
                    })
                    .then(() => setComments((rows) => rows.filter((row) => row.id !== comment.id)))
                    .catch((reason: unknown) => {
                      toast.error(reason instanceof Error ? reason.message : String(reason))
                    })
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <div className="whitespace-pre-wrap px-3 py-2 text-sm">{comment.body}</div>
          </div>
        ))}
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={translate('auto.components.TaskPage.codehubComment', 'Write a comment')}
          className="min-h-24 rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
        />
        <div className="flex justify-end">
          <Button size="sm" disabled={posting || draft.trim().length === 0} onClick={postComment}>
            {posting ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {translate('auto.components.TaskPage.codehubCommentSubmit', 'Comment')}
          </Button>
        </div>
      </div>
    </>
  )
  if (item.type === 'mr') {
    return (
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_300px] gap-5 px-4 py-4">
        <div className="flex min-w-0 flex-col gap-4">{thread}</div>
        <CodeHubPrSidebar state={state} />
      </div>
    )
  }
  return <div className="w-full px-2 py-6">{thread}</div>
}
