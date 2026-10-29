/**
 * WeLink 项目群面板正文（pr-review-notify 方案一）：历史消息渲染＋输入区。
 * 消息渲染口径：TEXT_MSG 文本（内嵌图片坐标串剥离）；CARD_MSG 解析 JSON——
 * 引用回复卡显示回复正文＋被引用摘要、标题链接卡显示标题＋可点链接；
 * IMAGESPAN_MSG 解析图片坐标串显示文件名/大小/链接＋随图文字；解析不了回落占位。
 * 评审消息呈可点击态，点击走共用跳转协议进 PR 详情页。
 */
import React, { useEffect, useRef, useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { parseReviewMessage } from '../../../../shared/workbench/pr-review-message'
import type { WelinkChatMessage } from '../../../../shared/welink-chat-types'
import { openPrReviewFromMessage } from '../pr-review-jump'
import { useProjectChatContext } from './project-chat-context'
import {
  parseWelinkCardContent,
  parseWelinkImageSpan,
  stripWelinkImageTokens,
  type WelinkCardContent,
  type WelinkImageContent
} from './welink-chat-content'

function formatTime(epochMs: number): string {
  const date = new Date(epochMs)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** 被引用消息只给首行摘要：引用卡里塞全文会把面板撑爆。 */
function quoteSnippet(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] ?? ''
  return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine
}

function MessageBody({
  message,
  card,
  image
}: {
  message: WelinkChatMessage
  card: WelinkCardContent | null
  image: WelinkImageContent | null
}): React.JSX.Element {
  if (card?.kind === 'reply') {
    return (
      <>
        <span className="whitespace-pre-wrap break-words">{card.replyText}</span>
        {card.quoteText ? (
          <span className="mt-1 block border-l-2 border-border pl-1.5 text-[10px] text-muted-foreground">
            {card.quoteName ? `回复 ${card.quoteName}：` : '回复：'}
            {quoteSnippet(card.quoteText)}
          </span>
        ) : null}
      </>
    )
  }
  if (card?.kind === 'link') {
    return (
      <button
        type="button"
        className="mt-0.5 block text-left font-medium text-primary hover:underline"
        onClick={() => void window.api.shell.openUrl(card.url)}
      >
        {card.title} ↗
      </button>
    )
  }
  if (image) {
    return (
      <>
        <button
          type="button"
          className="mt-0.5 flex items-center gap-1 text-left font-medium text-primary hover:underline"
          onClick={() => void window.api.shell.openUrl(image.url)}
        >
          <ImageIcon className="size-3.5 shrink-0" />
          {image.fileName ?? '图片'}
          {image.bytes ? `（${formatBytes(image.bytes)}）` : ''} ↗
        </button>
        {image.caption ? (
          <span className="mt-0.5 block whitespace-pre-wrap break-words">{image.caption}</span>
        ) : null}
      </>
    )
  }
  // 文本消息正文剥离内嵌图片坐标串；卡片/图片解析不了时按类型占位，不猜内容。
  const fallback =
    message.contentType === 'CARD_MSG'
      ? '[卡片]'
      : message.contentType === 'IMAGESPAN_MSG'
        ? '[图片]'
        : `[${message.contentType}]`
  const body =
    message.contentType === 'TEXT_MSG' ? stripWelinkImageTokens(message.content) : fallback
  return <span className="whitespace-pre-wrap break-words">{body}</span>
}

/**
 * 评审消息正文：链接行是 BW 自有深链（workbench://…），渲染成链接样式；
 * 点击由整行接管（跳转协议在 exe 内落 PR 页，不开浏览器）。
 */
function ReviewMessageBody({ content }: { content: string }): React.JSX.Element {
  return (
    <>
      {content.split(/\r?\n/).map((line, index) =>
        line.startsWith('链接：') ? (
          <span key={index} className="block break-all font-medium text-primary underline">
            {line}
          </span>
        ) : (
          <span key={index} className="block whitespace-pre-wrap break-words">
            {line}
          </span>
        )
      )}
    </>
  )
}

function ChatMessageRow({ message }: { message: WelinkChatMessage }): React.JSX.Element {
  const review = parseReviewMessage(message.content)
  const card = message.contentType === 'CARD_MSG' ? parseWelinkCardContent(message.content) : null
  const image =
    message.contentType === 'IMAGESPAN_MSG' ? parseWelinkImageSpan(message.content) : null
  return (
    <div
      className={cn(
        'max-w-[86%] rounded-md px-2 py-1.5 text-xs leading-relaxed',
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
      {review ? (
        <ReviewMessageBody content={message.content} />
      ) : (
        <MessageBody message={message} card={card} image={image} />
      )}
      {review ? (
        <span className="mt-1 block text-[11px] font-semibold text-primary">
          ↗ 点击进入 PR 详情页评审
        </span>
      ) : null}
    </div>
  )
}

export function ChatPanelBody(): React.JSX.Element {
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
