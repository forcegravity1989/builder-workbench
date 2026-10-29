/**
 * WeLink 项目群浮动按钮＋面板（pr-review-notify 方案一）。
 * 挂应用右下角（浮动工作区按钮上方）；未配置 [chat] 的项目整组不渲染。
 * 评审消息呈可点击态，点击走共用跳转协议进 PR 详情页；未登录呈现引导态。
 */
import React, { useEffect, useRef, useState } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { parseReviewMessage } from '../../../../shared/workbench/pr-review-message'
import type { WelinkChatMessage } from '../../../../shared/welink-chat-types'
import { openPrReviewFromMessage } from '../pr-review-jump'
import { isWorkbenchShell } from '../is-workbench-shell'
import { useProjectChat } from './use-project-chat'

/** 非文本消息不解析内容，只给类型占位（spec：CARD_MSG 等显示占位）。 */
function messagePlaceholder(contentType: string): string {
  if (contentType === 'CARD_MSG') {
    return '[卡片]'
  }
  if (contentType === 'IMAGESPAN_MSG') {
    return '[图片]'
  }
  return `[${contentType}]`
}

function formatTime(epochMs: number): string {
  const date = new Date(epochMs)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function ChatMessageRow({ message }: { message: WelinkChatMessage }): React.JSX.Element {
  const review = parseReviewMessage(message.content)
  const body =
    message.contentType === 'TEXT_MSG' ? message.content : messagePlaceholder(message.contentType)
  return (
    <div
      className={cn(
        'max-w-[86%] rounded-md px-2 py-1.5 text-xs leading-relaxed whitespace-pre-wrap break-words',
        review
          ? 'cursor-pointer border border-border bg-background hover:border-primary'
          : 'bg-muted'
      )}
      // 评审消息点击 → 跳转协议；普通文本消息不响应（解析失败按普通文本处理）。
      onClick={review ? () => void openPrReviewFromMessage(message.content) : undefined}
    >
      <span className="block text-[10px] text-muted-foreground">
        {message.sender} · {formatTime(message.serverSendTime)}
      </span>
      {body}
      {review ? (
        <span className="mt-1 block text-[11px] font-semibold text-primary">
          ↗ 点击进入 PR 详情页评审
        </span>
      ) : null}
    </div>
  )
}

function ChatPanelBody(): React.JSX.Element {
  const chat = useProjectChatContext()
  const listRef = useRef<HTMLDivElement>(null)
  const [jumpToBottom, setJumpToBottom] = useState(0)

  useEffect(() => {
    const list = listRef.current
    if (list) {
      list.scrollTop = list.scrollHeight
    }
  }, [chat.messages?.length, jumpToBottom])

  // 引导登录只在「确实拉不到历史且登录态为否」时出现：welink-cli 的 IM 命令会
  // 自动续期，EXPIRED 窗口里历史照样能拉，不能拿登录信号阻塞面板能力。
  if (chat.authed === false && chat.messages === null && chat.loadError !== null) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        welink-cli 未登录（或已过期）。到 <strong>设置 → 集成 → WeLink</strong> 卡登录后重开此面板；
        群配置读自 <code>.bw/project.toml [chat]</code>。
      </div>
    )
  }

  return (
    <>
      <div ref={listRef} className="scrollbar-sleek flex-1 overflow-y-auto px-3 py-2.5">
        {chat.loading && chat.messages === null ? (
          <div className="p-2 text-xs text-muted-foreground">读取群历史…</div>
        ) : chat.messages === null || chat.messages.length === 0 ? (
          <div className="p-2 text-xs text-muted-foreground">暂无历史消息</div>
        ) : (
          <div className="flex flex-col gap-2">
            {chat.messages.map((message) => (
              <ChatMessageRow key={message.msgId} message={message} />
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-2 border-t border-border p-2.5">
        <textarea
          className="min-h-[54px] flex-1 resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus-visible:outline-2 focus-visible:outline-primary"
          placeholder="输入文本，发送到项目群…"
          value={chat.draft}
          onChange={(event) => chat.setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Ctrl/Cmd+Enter 发送；裸 Enter 保留给换行——评审消息是多行文本。
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault()
              setJumpToBottom((n) => n + 1)
              void chat.send()
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          className="self-end"
          disabled={chat.sending || !chat.draft.trim()}
          onClick={() => {
            setJumpToBottom((n) => n + 1)
            void chat.send()
          }}
        >
          发送
        </Button>
      </div>
    </>
  )
}

// 面板与按钮共享同一份 chat 状态；context 避免两处各建一个 hook 实例。
const ProjectChatContext = React.createContext<ProjectChatContextValue | null>(null)
type ProjectChatContextValue = ReturnType<typeof useProjectChat>

function useProjectChatContext(): ProjectChatContextValue {
  const value = React.useContext(ProjectChatContext)
  if (!value) {
    throw new Error('ProjectChatFloating 内部组件必须在 Provider 内使用')
  }
  return value
}

export function WorkbenchProjectChatFloating(): React.JSX.Element | null {
  const chat = useProjectChat()
  // Workbench 壳外（纯 Orca 形态）与未配 [chat] 的项目都不出现（spec N01）。
  if (!isWorkbenchShell() || !chat.config) {
    return null
  }
  return (
    <ProjectChatContext.Provider value={chat}>
      {/* 右下角浮动工作区按钮上方；同层 z-index，互不遮挡。 */}
      <div className="fixed right-6 bottom-[124px] z-[46]">
        {chat.open ? (
          <div
            data-project-chat-panel
            className="mb-3 flex h-[420px] w-[340px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg"
          >
            <div className="flex items-center gap-2 border-b border-border px-3 py-2.5 text-xs">
              <span className="font-medium">WeLink 项目群</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {chat.config.groupId}
              </span>
              <button
                type="button"
                aria-label="收起"
                className="ml-auto text-muted-foreground hover:text-foreground"
                onClick={() => chat.setOpen(false)}
              >
                <X className="size-3.5" />
              </button>
            </div>
            <ChatPanelBody />
          </div>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="relative rounded-lg border-transparent bg-card text-foreground shadow-[0_4px_12px_rgb(0_0_0_/_0.22),0_0_0_1px_color-mix(in_srgb,var(--foreground)_12%,transparent)] hover:-translate-y-0.5 hover:bg-accent dark:bg-accent dark:shadow-[0_6px_16px_rgb(0_0_0_/_0.55),0_0_0_1px_rgb(255_255_255_/_0.22)]"
          data-project-chat-toggle
          aria-label={chat.open ? '收起项目群面板' : '展开项目群面板'}
          aria-pressed={chat.open}
          onClick={() => chat.setOpen(!chat.open)}
        >
          <MessageCircle className="size-4" />
          {chat.unread > 0 ? (
            <span
              aria-hidden
              data-project-chat-unread
              className="pointer-events-none absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground ring-2 ring-card dark:ring-accent"
            >
              {chat.unread > 99 ? '99+' : chat.unread}
            </span>
          ) : null}
        </Button>
      </div>
    </ProjectChatContext.Provider>
  )
}
