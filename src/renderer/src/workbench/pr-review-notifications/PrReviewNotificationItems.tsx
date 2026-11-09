import React, { useState } from 'react'
import {
  AlertCircle,
  BellRing,
  ExternalLink,
  GitPullRequest,
  Loader2,
  MessageSquare,
  RotateCw,
  Trash2
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { MetadataActionIcon } from '@/components/sidebar/WorktreeCardMetadataControls'
import {
  MetadataStatusBadge,
  ReviewStateBadge,
  ReviewChecksBadge
} from '@/components/sidebar/WorktreeCardMetadataStatusBadges'
import type { ReviewIncomingNote, ReviewOutgoingNote } from './model'
import { deriveOutgoingStatus } from './model'

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return '时间未知'
  }
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

function ProjectLabel({ owner, name }: { owner: string; name: string }): React.JSX.Element {
  return (
    <span className="truncate text-[11px] text-muted-foreground">
      {owner}/{name}
    </span>
  )
}

function CommentCountBadge({ count }: { count: number | null }): React.JSX.Element | null {
  if (!count) {
    return null
  }
  return (
    <span title={`未解决检视意见 ${count} 条`}>
      <MetadataStatusBadge
        label={String(count)}
        className="border-border bg-muted/30 text-muted-foreground"
      >
        <MessageSquare />
      </MetadataStatusBadge>
    </span>
  )
}

function RoundBadge({ round }: { round: number }): React.JSX.Element | null {
  if (round < 2) {
    return null
  }
  return (
    <span title={`第 ${round} 轮`}>
      <MetadataStatusBadge
        label={`第 ${round} 轮`}
        className="border-border bg-muted/30 text-muted-foreground"
      >
        <RotateCw />
      </MetadataStatusBadge>
    </span>
  )
}

export function OutgoingReviewItem({
  note,
  onOpen,
  onResend,
  onDelete,
  onError
}: {
  note: ReviewOutgoingNote
  onOpen: () => void
  onResend: () => Promise<void>
  onDelete: () => void
  onError: (message: string) => void
}): React.JSX.Element {
  const status = deriveOutgoingStatus(note)
  const [busy, setBusy] = useState(false)

  async function reRequest(): Promise<void> {
    setBusy(true)
    try {
      await onResend()
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5 border-b border-border/50 pb-2.5 last:border-b-0 last:pb-0">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <button
          type="button"
          className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground hover:text-foreground"
          onClick={onOpen}
          title="打开 PR 详情"
        >
          <GitPullRequest className="size-3 shrink-0" />
          PR #{note.prNumber}
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <MetadataActionIcon label="打开 PR 详情" onClick={onOpen}>
            <ExternalLink className="size-3" />
          </MetadataActionIcon>
          <MetadataActionIcon label="删除这条评审通知" onClick={onDelete}>
            <Trash2 className="size-3" />
          </MetadataActionIcon>
        </div>
      </div>
      <button
        type="button"
        className="text-left text-[13px] font-semibold leading-snug break-words text-foreground hover:text-primary"
        onClick={onOpen}
      >
        请求评审 PR #{note.prNumber} · 第 {note.round} 轮
      </button>
      <div className="flex flex-wrap gap-1">
        <ReviewStateBadge
          label="PR"
          state={
            status.error ? undefined : ((status.merged ? 'merged' : status.prState) ?? undefined)
          }
        />
        <ReviewChecksBadge status={status.error ? undefined : (status.checksState ?? undefined)} />
        {status.merged || status.error ? null : (
          <CommentCountBadge count={status.openCommentCount} />
        )}
        <RoundBadge round={note.round} />
      </div>
      <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
        <ProjectLabel owner={note.repo.owner} name={note.repo.name} />
        <span>·</span>
        <span>发送于 {formatTime(note.sentAt)}</span>
        <span>·</span>
        <span>自动同步</span>
      </div>
      {status.error ? (
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <AlertCircle className="size-3 shrink-0" />
          <span className="break-words">
            {status.error}
            {status.checkedAt ? ` · 上次 ${formatTime(status.checkedAt)}` : ''}
          </span>
        </span>
      ) : note.readback === null ? (
        <span className="text-[11px] text-muted-foreground">状态读取中</span>
      ) : null}
      <div className="space-y-1 text-[11px] text-muted-foreground">
        {note.deliveries.map((delivery) => (
          <p key={delivery.environmentId} className={delivery.ok ? '' : 'text-destructive'}>
            {delivery.name} · {delivery.ok ? '已送达' : `未送达：${delivery.error ?? '未确认接收'}`}
          </p>
        ))}
      </div>
      {status.canReRequest ? (
        <div>
          <Button variant="outline" size="xs" disabled={busy} onClick={() => void reRequest()}>
            {busy ? <Loader2 className="size-3 animate-spin" /> : <BellRing className="size-3" />}
            解决检视意见后 · 再发起评审
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export function IncomingReviewItem({
  note,
  missingProject,
  onOpen
}: {
  note: ReviewIncomingNote
  missingProject: boolean
  onOpen: () => void
}): React.JSX.Element {
  const state = note.readback?.prState ?? (note.readback?.merged ? 'merged' : null)
  return (
    <button
      type="button"
      className="group flex w-full flex-col gap-1.5 border-b border-border/50 pb-2.5 text-left last:border-b-0 last:pb-0"
      onClick={onOpen}
      title="打开 PR 详情"
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        <GitPullRequest className="size-3 shrink-0" />
        PR #{note.prNumber}
      </span>
      <span className="text-[13px] font-semibold leading-snug break-words text-foreground group-hover:text-primary">
        {note.title}
      </span>
      <span className="flex flex-wrap gap-1">
        <ReviewStateBadge
          label="PR"
          state={note.readbackError ? undefined : (state ?? undefined)}
        />
        <ReviewChecksBadge
          status={note.readbackError ? undefined : (note.readback?.checksState ?? undefined)}
        />
        {state === 'merged' || note.readbackError ? null : (
          <CommentCountBadge count={note.readback?.openCommentCount ?? null} />
        )}
        <RoundBadge round={note.round} />
      </span>
      <span className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
        <ProjectLabel owner={note.repo.owner} name={note.repo.name} />
        <span>·</span>
        <span>{note.sender}</span>
        <span>·</span>
        <span>{formatTime(note.receivedAt)}</span>
      </span>
      {note.readbackError ? (
        <span className="text-[11px] text-destructive">
          {note.readbackError}
          {note.readback?.checkedAt ? ` · 上次 ${formatTime(note.readback.checkedAt)}` : ''}
        </span>
      ) : null}
      {missingProject ? <span className="text-[10px] text-destructive">本机没有该项目</span> : null}
    </button>
  )
}

export function SectionCount({ count }: { count: number }): React.JSX.Element | null {
  return count > 0 ? (
    <span className="text-[11px] font-medium text-muted-foreground">{count}</span>
  ) : null
}
