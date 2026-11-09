import React, { useState } from 'react'
import { Bell, GitPullRequest, Inbox, Loader2, RotateCw, Send, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  WorktreeCardDetailSection,
  WorktreeCardDetailSectionContent
} from '@/components/sidebar/WorktreeCardDetailSection'
import { DetailHeader, MetadataActionIcon } from '@/components/sidebar/WorktreeCardMetadataControls'
import type { ReviewIncomingNote, ReviewOutgoingNote, ReviewNotificationsState } from './model'
import { totalUnreadBadgeCount } from './model'
import { IncomingReviewItem, OutgoingReviewItem, SectionCount } from './PrReviewNotificationItems'
import { useFloatingTriggerPosition } from '@/components/floating-terminal/use-floating-trigger-position'

export function PrReviewNotificationsView({
  notifications,
  error,
  refreshing,
  onRefresh,
  onError,
  onOpen,
  onDelete,
  onResend,
  missingProject
}: {
  notifications: ReviewNotificationsState
  error: string | null
  refreshing: boolean
  onRefresh: (force?: boolean) => void
  onError: (message: string) => void
  onOpen: (identity: ReviewIncomingNote['repo'], prNumber: number) => Promise<void>
  onDelete: (id: string) => void
  onResend: (note: ReviewOutgoingNote) => Promise<void>
  missingProject: (note: ReviewIncomingNote) => boolean
}): React.JSX.Element {
  const { position, dragHandlers } = useFloatingTriggerPosition({
    storageKey: 'bw.pr-review-trigger-position.v1',
    rightGap: 72,
    bottomGap: 72
  })
  const [open, setOpen] = useState(false)
  const badgeCount = totalUnreadBadgeCount(notifications)
  const hasAny = badgeCount > 0
  const handleOpenChange = (next: boolean): void => {
    setOpen(next)
    if (next) onRefresh()
  }
  async function openNote(identity: ReviewIncomingNote['repo'], prNumber: number): Promise<void> {
    setOpen(false)
    await onOpen(identity, prNumber)
  }
  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          style={{ left: position.left, top: position.top }}
          className="fixed z-[47] cursor-grab rounded-lg border-transparent bg-card text-foreground shadow-[0_4px_12px_rgb(0_0_0_/_0.22),0_0_0_1px_color-mix(in_srgb,var(--foreground)_12%,transparent)] hover:-translate-y-0.5 hover:bg-accent active:translate-y-0 active:cursor-grabbing dark:bg-accent dark:shadow-[0_6px_16px_rgb(0_0_0_/_0.55),0_0_0_1px_rgb(255_255_255_/_0.22)] dark:hover:bg-[color-mix(in_srgb,var(--accent)_82%,white)]"
          aria-label={open ? '收起评审通知' : `评审通知，共 ${badgeCount} 条`}
          title="评审通知"
          {...dragHandlers}
        >
          <GitPullRequest className="size-4" />
          {badgeCount > 0 ? (
            <span className="pointer-events-none absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold leading-4 text-white ring-2 ring-card dark:ring-accent">
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        // Why: 自动聚焦会先落到带 Tooltip 的关闭按钮上，Tooltip 的浮层会盖住本层，
        // 抢走 Esc 与外部点击；通知浮层保持焦点在入口，Tab 再进入内容。
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="flex max-h-[28rem] w-80 flex-col p-0 text-xs"
      >
        <div className="border-b border-border/60 px-3 py-2">
          <DetailHeader
            icon={<Bell className="size-3.5" />}
            label="PR 评审"
            actions={
              <>
                <span className="px-1 text-[11px] font-medium text-muted-foreground">
                  {badgeCount} 条
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-6"
                  aria-label="刷新 PR 动态"
                  title="刷新 PR 动态"
                  disabled={refreshing}
                  onClick={() => onRefresh(true)}
                >
                  {refreshing ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RotateCw className="size-3" />
                  )}
                </Button>
                <MetadataActionIcon label="关闭" onClick={() => setOpen(false)}>
                  <X className="size-3" />
                </MetadataActionIcon>
              </>
            }
          />
        </div>
        <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto p-3">
          {error ? (
            <div className="mb-2 border-b border-border/50 pb-2 text-[11px] text-destructive">
              {error}
            </div>
          ) : null}
          <div className="flex flex-col gap-3">
            <WorktreeCardDetailSection>
              <DetailHeader
                icon={<Send className="size-3" />}
                label="我发出的评审"
                actions={<SectionCount count={notifications.outgoing.length} />}
              />
              <WorktreeCardDetailSectionContent className="space-y-2.5">
                {notifications.outgoing.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    {hasAny ? '暂无发出的评审' : '在工作树上右键可发送评审'}
                  </p>
                ) : (
                  notifications.outgoing.map((note) => (
                    <OutgoingReviewItem
                      key={note.id}
                      note={note}
                      onOpen={() => void openNote(note.repo, note.prNumber)}
                      onError={onError}
                      onDelete={() => onDelete(note.id)}
                      onResend={() => onResend(note)}
                    />
                  ))
                )}
              </WorktreeCardDetailSectionContent>
            </WorktreeCardDetailSection>
            <WorktreeCardDetailSection>
              <DetailHeader
                icon={<Inbox className="size-3" />}
                label="待我评审"
                actions={<SectionCount count={notifications.incoming.length} />}
              />
              <WorktreeCardDetailSectionContent className="space-y-2.5">
                {notifications.incoming.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">暂无待我评审的请求</p>
                ) : (
                  notifications.incoming.map((note) => (
                    <IncomingReviewItem
                      key={note.id}
                      note={note}
                      missingProject={missingProject(note)}
                      onOpen={() => void openNote(note.repo, note.prNumber)}
                    />
                  ))
                )}
              </WorktreeCardDetailSectionContent>
            </WorktreeCardDetailSection>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
