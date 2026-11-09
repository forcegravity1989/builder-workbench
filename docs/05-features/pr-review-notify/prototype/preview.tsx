import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent
} from '@/components/ui/dropdown-menu'
import { PrReviewNotificationsView } from '@/workbench/pr-review-notifications/PrReviewNotificationsView'
import { ReviewSendMenuItem } from '@/workbench/pr-review-notifications/ReviewSendMenuItem'
import {
  applyIncomingRequest,
  recordSentReview,
  deleteOutgoingNote,
  EMPTY_REVIEW_NOTIFICATIONS,
  type ReviewNotificationsState,
  type ReviewReadback
} from '@/workbench/pr-review-notifications/model'
import type { ReviewRequestPayload } from '../../../../src/shared/workbench/pr-review-request'
import { i18n } from '@/i18n/i18n'

const target = {
  environmentId: 'demo-reviewer',
  name: '评审主机',
  pairingRevision: 1,
  ok: true
}
const repo = { host: 'github.com', owner: 'example', name: 'workbench-demo' }
function Preview() {
  const [author, setAuthor] = useState<ReviewNotificationsState>(EMPTY_REVIEW_NOTIFICATIONS)
  const [reviewer, setReviewer] = useState<ReviewNotificationsState>(EMPTY_REVIEW_NOTIFICATIONS)
  const [side, setSide] = useState<'author' | 'reviewer'>('author')
  const [detail, setDetail] = useState(false)
  const [noPr, setNoPr] = useState(false)
  const [dark, setDark] = useState(false)
  const readback = (count = 0, merged = false): ReviewReadback => ({
    openCommentCount: count,
    merged,
    prState: merged ? 'merged' : 'open',
    checksState: 'success',
    checkedAt: new Date().toISOString()
  })
  const send = async () => {
    const previous = author.outgoing[0]
    const now = new Date().toISOString()
    const request: ReviewRequestPayload = {
      repo,
      prNumber: 383,
      title: '通知：打通 PR 评审旅程',
      sourceBranch: 'feature/review',
      targetBranch: 'main',
      sender: '作者主机',
      cycleId: previous?.cycleId ?? crypto.randomUUID(),
      cycleStartedAt: previous?.cycleStartedAt ?? now,
      round: (previous?.round ?? 0) + 1,
      sentAt: now
    }
    setAuthor((current) => {
      const next = recordSentReview(current, request, [target])
      return { ...next, outgoing: next.outgoing.map((note) => ({ ...note, readback: readback() })) }
    })
    setReviewer((current) => {
      const next = applyIncomingRequest(current, {
        ...request,
        senderId: 'demo-author',
        receivedAt: now
      })
      return { ...next, incoming: next.incoming.map((note) => ({ ...note, readback: readback() })) }
    })
  }
  const facts = (count = 0, merged = false, error: string | null = null) => {
    setAuthor((s) => ({
      ...s,
      outgoing: s.outgoing.map((n) => ({
        ...n,
        readback: error ? n.readback : readback(count, merged),
        readbackError: error
      }))
    }))
    setReviewer((s) => ({
      ...s,
      incoming: s.incoming.map((n) => ({
        ...n,
        readback: error ? n.readback : readback(count, merged),
        readbackError: error
      }))
    }))
  }
  return (
    <TooltipProvider>
      <iframe
        title="沿用当前版本工作区原型"
        src="../../version-workspace/version-workspace-prototype-475.html"
        style={{
          position: 'fixed',
          inset: 48,
          width: 'calc(100% - 96px)',
          height: 'calc(100% - 96px)',
          border: 0
        }}
      />
      <div className="fixed inset-x-0 top-0 z-50 flex h-12 items-center gap-2 border-b bg-background px-3 text-xs">
        <strong>原型演示工具</strong>
        <Button
          size="xs"
          variant="outline"
          onClick={() => setSide(side === 'author' ? 'reviewer' : 'author')}
        >
          {side === 'author' ? '发起主机' : '接收主机'}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="xs">工作树 #383</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <ReviewSendMenuItem
              disabled={noPr}
              reason={noPr ? '分支没有关联的开放 PR' : undefined}
              onSend={() => void send()}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="xs" variant="outline" onClick={() => facts(1)}>
          模拟提出意见
        </Button>
        <Button size="xs" variant="outline" onClick={() => facts(0, true)}>
          模拟合入
        </Button>
        <Button size="xs" variant="outline" onClick={() => facts(0, false, '读取失败，状态未知')}>
          模拟读失败
        </Button>
        <Button size="xs" variant="outline" onClick={() => setNoPr(!noPr)}>
          {noPr ? '恢复关联 PR' : '无 PR'}
        </Button>
        <Button
          size="xs"
          variant="outline"
          onClick={() => {
            setDark(!dark)
            document.documentElement.classList.toggle('dark', !dark)
          }}
        >
          外观
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            setAuthor(EMPTY_REVIEW_NOTIFICATIONS)
            setReviewer(EMPTY_REVIEW_NOTIFICATIONS)
            setDetail(false)
          }}
        >
          重置
        </Button>
      </div>
      <PrReviewNotificationsView
        notifications={side === 'author' ? author : reviewer}
        error={null}
        refreshing={false}
        onRefresh={() => {}}
        onError={() => {}}
        onOpen={async () => setDetail(true)}
        onDelete={(id) => setAuthor((s) => deleteOutgoingNote(s, id))}
        onResend={send}
        missingProject={() => false}
      />
      {detail && (
        <div className="fixed inset-x-1/4 top-1/3 z-40 rounded-lg border bg-card p-8 shadow-xl">
          <h2 className="text-lg font-semibold">沿用原生 PR 详情</h2>
          <p className="my-4 text-sm text-muted-foreground">
            通知直接定位 PR #383；评论、检视、合入和关闭沿用原生权限。此处不重画已有详情页。
          </p>
          <Button onClick={() => setDetail(false)}>返回</Button>
        </div>
      )}
      <p className="fixed bottom-2 left-3 text-xs text-muted-foreground">
        通知组件与产品共用源码；主机、PR 与发送结果为演示数据，不代表真实送达。
      </p>
    </TooltipProvider>
  )
}
void i18n
  .changeLanguage('zh')
  .then(() => createRoot(document.getElementById('root')!).render(<Preview />))
