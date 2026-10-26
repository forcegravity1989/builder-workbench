import { useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ExternalLink, MessageSquarePlus, Trash2 } from 'lucide-react'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { CommentReplyForm } from '@/components/github-item-dialog/discuss-item/comment-reply-form'
import {
  PR_COMMENT_OPEN_AUTHOR_CLASS,
  PR_COMMENT_RESOLVED_AUTHOR_CLASS,
  PR_COMMENT_RESOLVED_CONTAINER_CLASS
} from '@/lib/pr-comment-resolution-classes'
import type { PRCommentAudienceFilter } from '../../../../../shared/pr-comment-audience'
import { cn } from '@/lib/utils'
import { codehubApi } from '@/lib/codehub-api'
import { formatRelativeTime } from '../../task-page-source-context'
import type { CodeHubComment } from '../../../../../shared/codehub-tasks'
import type { CodeHubDetailState } from './use-codehub-detail'

export type CodeHubCommentGroup =
  | { kind: 'standalone'; comment: CodeHubComment }
  | { kind: 'thread'; threadId: string; root: CodeHubComment; replies: CodeHubComment[] }

// Same Map-based algorithm as the shared GitHub grouping: a note joins its
// discussion thread regardless of list position. Issue comments carry no
// discussion id and always render as standalone cards.
export function groupCodeHubComments(comments: readonly CodeHubComment[]): CodeHubCommentGroup[] {
  const groups: CodeHubCommentGroup[] = []
  const threads = new Map<string, Extract<CodeHubCommentGroup, { kind: 'thread' }>>()
  for (const comment of comments) {
    if (!comment.discussionId) {
      groups.push({ kind: 'standalone', comment })
      continue
    }
    const existing = threads.get(comment.discussionId)
    if (existing) {
      existing.replies.push(comment)
      continue
    }
    const group: Extract<CodeHubCommentGroup, { kind: 'thread' }> = {
      kind: 'thread',
      threadId: comment.discussionId,
      root: comment,
      replies: []
    }
    threads.set(comment.discussionId, group)
    groups.push(group)
  }
  return groups
}

export function codeHubCommentGroupId(group: CodeHubCommentGroup): string {
  return group.kind === 'thread' ? `thread:${group.threadId}` : `comment:${group.comment.id}`
}

// CodeHub notes carry an explicit `from_robot` flag, so audience counting
// needs none of the login-name heuristics the GitHub side relies on.
export function codeHubCommentAudienceCounts(
  comments: readonly CodeHubComment[]
): Record<PRCommentAudienceFilter, number> {
  let bot = 0
  for (const comment of comments) {
    if (comment.isBot) {
      bot += 1
    }
  }
  return { all: comments.length, human: comments.length - bot, bot }
}

export function filterCodeHubCommentsByAudience(
  comments: readonly CodeHubComment[],
  filter: PRCommentAudienceFilter
): CodeHubComment[] {
  if (filter === 'bot') {
    return comments.filter((comment) => comment.isBot)
  }
  if (filter === 'human') {
    return comments.filter((comment) => !comment.isBot)
  }
  return [...comments]
}

function CodeHubCommentCard({
  comment,
  state,
  isReply = false
}: {
  comment: CodeHubComment
  state: CodeHubDetailState
  isReply?: boolean
}) {
  const { item, setComments } = state
  const [replyOpen, setReplyOpen] = useState(false)
  // GitLab-style note anchor: the task page URL plus #note_<id> jumps to
  // this comment on the CodeHub website.
  const commentUrl = state.detail?.url ? `${state.detail.url}#note_${comment.id}` : null
  return (
    <div
      className={cn(
        'min-w-0 overflow-hidden rounded-lg border border-border/40 bg-card/50 shadow-xs',
        isReply && 'ml-6 max-w-[calc(100%-1.5rem)]',
        comment.isResolved && PR_COMMENT_RESOLVED_CONTAINER_CLASS
      )}
    >
      <div className="flex min-w-0 items-center gap-2 border-b border-border/40 px-3 py-2">
        {comment.authorAvatarUrl ? (
          <img
            src={comment.authorAvatarUrl}
            alt={comment.author ?? ''}
            className="size-5 shrink-0 rounded-full"
          />
        ) : (
          <div className="size-5 shrink-0 rounded-full bg-muted" />
        )}
        <span
          className={cn(
            'min-w-0 truncate text-[13px] font-semibold',
            comment.isResolved ? PR_COMMENT_RESOLVED_AUTHOR_CLASS : PR_COMMENT_OPEN_AUTHOR_CLASS
          )}
        >
          {comment.author ?? ''}
        </span>
        <span className="shrink-0 text-[12px] text-muted-foreground">
          · {comment.createdAt ? formatRelativeTime(comment.createdAt) : ''}
        </span>
        {comment.path ? (
          <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground/70">
            {comment.path.split('/').pop()}
            {comment.line
              ? translate('auto.components.GitHubItemDialog.136542c9ba', ':L{{value0}}', {
                  value0: comment.line
                })
              : ''}
          </span>
        ) : null}
        {comment.isResolved ? (
          <span className="rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {translate('auto.components.GitHubItemDialog.68cb993d61', 'resolved')}
          </span>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {comment.discussionId ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="size-7"
                  onClick={() => setReplyOpen((open) => !open)}
                  aria-label={translate(
                    'auto.components.GitHubItemDialog.bca8eb39ac',
                    'Reply to comment'
                  )}
                >
                  <MessageSquarePlus className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {translate('auto.components.GitHubItemDialog.bca8eb39ac', 'Reply to comment')}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {commentUrl ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-7"
                  onClick={() => {
                    window.api.shell.openUrl(commentUrl)
                  }}
                  aria-label={translate(
                    'auto.components.TaskPage.codehubOpenComment',
                    'Open comment on CodeHub'
                  )}
                >
                  <ExternalLink className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {translate(
                  'auto.components.TaskPage.codehubOpenComment',
                  'Open comment on CodeHub'
                )}
              </TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-7"
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
                      commentId: comment.id,
                      // Standalone notes delete by note id alone; only notes in a
                      // multi-note discussion need the discussion id.
                      discussionId: comment.individual ? null : comment.discussionId
                    })
                    // Re-list instead of filtering locally: deleting a thread
                    // starter must also drop its now-orphaned replies.
                    .then(() =>
                      codehubApi.listComments({
                        repoPath: item.repoPath!,
                        repoId: item.repoId,
                        kind: item.type,
                        iid: item.iid
                      })
                    )
                    .then((rows) => setComments(rows))
                    .catch((reason: unknown) => {
                      toast.error(reason instanceof Error ? reason.message : String(reason))
                    })
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {translate('auto.components.TaskPage.codehubDeleteComment', 'Delete comment')}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="min-w-0 px-3 py-2">
        <CommentMarkdown
          content={comment.body}
          variant="document"
          className="min-w-0 max-w-full overflow-hidden break-words text-[13px] leading-relaxed [&_a]:break-all [&_code]:break-words [&_pre]:max-w-full"
        />
        {comment.discussionId && replyOpen ? (
          <CommentReplyForm
            className="mt-3"
            placeholder={
              comment.path
                ? translate(
                    'auto.components.GitHubItemDialog.86f809e2ce',
                    'Reply in this review thread'
                  )
                : translate('auto.components.GitHubItemDialog.080d071d48', 'Reply to @{{value0}}', {
                    value0: comment.author ?? ''
                  })
            }
            onCancel={() => setReplyOpen(false)}
            onSubmit={(replyBody) => state.postReply(comment.discussionId!, replyBody)}
          />
        ) : null}
      </div>
    </div>
  )
}

export function CodeHubCommentThread({
  group,
  state
}: {
  group: CodeHubCommentGroup
  state: CodeHubDetailState
}) {
  const cards =
    group.kind === 'thread'
      ? [
          <CodeHubCommentCard key={group.root.id} comment={group.root} state={state} />,
          ...group.replies.map((reply) => (
            <CodeHubCommentCard key={reply.id} comment={reply} state={state} isReply />
          ))
        ]
      : [<CodeHubCommentCard key={group.comment.id} comment={group.comment} state={state} />]
  const root = group.kind === 'thread' ? group.root : group.comment
  const count = group.kind === 'thread' ? group.replies.length + 1 : 1
  if (root.isResolved !== true) {
    return <div className="flex min-w-0 flex-col gap-3">{cards}</div>
  }
  return (
    <Accordion type="single" collapsible>
      <AccordionItem
        value={codeHubCommentGroupId(group)}
        className="rounded-lg border border-border/40 bg-card/40"
      >
        <AccordionTrigger className="px-3 py-2 text-[13px] text-muted-foreground hover:bg-accent/30">
          <span className="min-w-0 truncate">
            {translate('auto.components.GitHubItemDialog.228e2f59d3', 'Resolved')}{' '}
            {count > 1
              ? translate('auto.components.GitHubItemDialog.28d0d3374f', 'thread')
              : translate('auto.components.GitHubItemDialog.e2bf3e41a9', 'comment')}{' '}
            {translate('auto.components.GitHubItemDialog.0ae387d8ca', 'by')} {root.author}
            {count > 1 ? ` (${count})` : ''}
          </span>
        </AccordionTrigger>
        <AccordionContent className="flex min-w-0 flex-col gap-3 px-3 pb-3 pt-0">
          {cards}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
