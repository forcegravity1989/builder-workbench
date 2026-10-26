import { useEffect, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { FolderKanban, LoaderCircle, MessageSquare, Send } from 'lucide-react'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { GitHubMarkdownComposer } from '@/components/github/GitHubMarkdownComposer'
import {
  getPRCommentAudienceEmptyLabel,
  getPrCommentAudienceFilters
} from '@/lib/pr-comment-audience-labels'
import type { PRCommentAudienceFilter } from '../../../../../shared/pr-comment-audience'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '../../task-page-source-context'
import {
  CodeHubCommentThread,
  codeHubCommentAudienceCounts,
  codeHubCommentGroupId,
  filterCodeHubCommentsByAudience,
  groupCodeHubComments
} from './CommentThread'
import type { CodeHubDetailState } from './use-codehub-detail'
import { CodeHubPrSidebar } from './PrSidebar'

export function CodeHubConversation({ state }: { state: CodeHubDetailState }) {
  const { item, detail, error, commentError, comments, draft, setDraft, posting, postComment } =
    state
  const isMr = item.type === 'mr'
  const [commentFilter, setCommentFilter] = useState<PRCommentAudienceFilter>('all')
  useEffect(() => {
    setCommentFilter('all')
  }, [item.type, item.iid, item.repoId])
  const counts = codeHubCommentAudienceCounts(comments)
  const visibleComments = isMr ? filterCodeHubCommentsByAudience(comments, commentFilter) : comments
  const groups = groupCodeHubComments(visibleComments)
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
        <div className="flex items-center gap-2 pt-1">
          {isMr ? (
            <MessageSquare className="size-4 text-muted-foreground" />
          ) : (
            <FolderKanban className="size-4 text-muted-foreground" />
          )}
          <span className="text-[13px] font-medium text-foreground">
            {isMr
              ? translate('auto.components.GitHubItemDialog.1506916c09', 'Comments')
              : translate('auto.components.GitHubItemDialog.timeline.activity', 'Activity')}
          </span>
          {comments.length > 0 ? (
            <span className="rounded-full border border-border/50 bg-muted/30 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
              {comments.length}
            </span>
          ) : null}
        </div>
        {isMr && comments.length > 0 ? (
          <div className="grid grid-cols-3 rounded-lg border border-border/50 bg-background p-0.5">
            {getPrCommentAudienceFilters().map((filter) => {
              const isActive = commentFilter === filter.value
              return (
                <button
                  key={filter.value}
                  type="button"
                  className={cn(
                    'flex h-8 items-center justify-center gap-1 rounded-md px-2 text-[12px] font-medium text-muted-foreground transition-colors',
                    isActive && 'bg-muted text-foreground'
                  )}
                  aria-pressed={isActive}
                  onClick={() => setCommentFilter(filter.value)}
                >
                  <span>{filter.label}</span>
                  <span className="tabular-nums">{counts[filter.value]}</span>
                </button>
              )
            })}
          </div>
        ) : null}
        {comments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/50 px-3 py-6 text-left text-[13px] text-muted-foreground">
            {isMr
              ? translate('auto.components.GitHubItemDialog.5a94f3d0e9', 'No comments yet.')
              : translate(
                  'auto.components.GitHubItemDialog.timeline.noActivity',
                  'No activity yet.'
                )}
          </div>
        ) : visibleComments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/50 px-3 py-6 text-center text-[13px] text-muted-foreground">
            {getPRCommentAudienceEmptyLabel(commentFilter)}
          </div>
        ) : (
          groups.map((group) => (
            <CodeHubCommentThread key={codeHubCommentGroupId(group)} group={group} state={state} />
          ))
        )}
        <div className="relative">
          <GitHubMarkdownComposer
            value={draft}
            onChange={setDraft}
            placeholder={translate('auto.components.GitHubItemDialog.c5c117270e', 'Add a comment…')}
            disabled={posting}
            minHeightClassName="min-h-28 pb-14 pr-14"
            className="w-full"
            onSubmitShortcut={postComment}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                onClick={postComment}
                disabled={posting || draft.trim().length === 0}
                className="absolute bottom-3 right-3 shadow-sm"
                aria-label={translate('auto.components.TaskPage.codehubCommentSubmit', 'Comment')}
              >
                {posting ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {translate('auto.components.TaskPage.codehubCommentSubmit', 'Comment')}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </>
  )
  if (isMr) {
    return (
      <TooltipProvider>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_300px] gap-5 px-4 py-4">
          <div className="flex min-w-0 flex-col gap-4">{thread}</div>
          <CodeHubPrSidebar state={state} />
        </div>
      </TooltipProvider>
    )
  }
  return (
    <TooltipProvider>
      <div className="w-full px-2 py-6">{thread}</div>
    </TooltipProvider>
  )
}
