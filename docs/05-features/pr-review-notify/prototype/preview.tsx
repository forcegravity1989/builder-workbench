import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster, toast } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent
} from '@/components/ui/dropdown-menu'
import { PrReviewNotificationsView } from '@/workbench/pr-review-notifications/PrReviewNotificationsView'
import { ReviewSendMenuItem } from '@/workbench/pr-review-notifications/ReviewSendMenuItem'
import { ReviewSendDialog } from '@/workbench/pr-review-notifications/ReviewSendDialog'
import {
  applyIncomingRequest,
  recordSentReview,
  deleteOutgoingNote,
  EMPTY_REVIEW_NOTIFICATIONS,
  type ReviewNotificationsState,
  type ReviewReadback
} from '@/workbench/pr-review-notifications/model'
import type {
  ReviewRequestPayload,
  ReviewPeerTarget,
  ReviewSendInput
} from '../../../../src/shared/workbench/pr-review-request'
import { i18n } from '@/i18n/i18n'

const targets: ReviewPeerTarget[] = [
  {
    environmentId: 'demo-reviewer',
    name: '评审主机',
    pairingRevision: 1
  },
  { environmentId: 'demo-committer', name: '决策主机（通过共享访问项目）', pairingRevision: 1 },
  { environmentId: 'demo-other', name: '其他已连接主机', pairingRevision: 1 }
]
function Preview() {
  const [author, setAuthor] = useState<ReviewNotificationsState>(EMPTY_REVIEW_NOTIFICATIONS)
  const [reviewer, setReviewer] = useState<ReviewNotificationsState>(EMPTY_REVIEW_NOTIFICATIONS)
  const [side, setSide] = useState<'author' | 'reviewer'>('author')
  const [detail, setDetail] = useState(false)
  const [noPr, setNoPr] = useState(false)
  const [dark, setDark] = useState(false)
  const [codehub, setCodehub] = useState(false)
  const [missingProject, setMissingProject] = useState(false)
  const [partialFailure, setPartialFailure] = useState(false)
  const [draft, setDraft] = useState<ReviewSendInput | null>(null)
  const [selected, setSelected] = useState<ReviewPeerTarget[]>([])
  const [sendError, setSendError] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const repo = codehub
    ? { host: 'codehub-g.huawei.com', path: 'Org/Group/workbench-demo' }
    : { host: 'github.com', path: 'example/workbench-demo' }
  const openSend = async () => {
    setSendError(null)
    setSelected(author.pending[0]?.targets ?? author.outgoing[0]?.deliveries ?? targets)
    setDraft(
      author.pending[0]?.request ?? {
        repo,
        prNumber: 383,
        title: '通知：打通评审旅程',
        sourceBranch: 'feature/review',
        targetBranch: 'main'
      }
    )
  }
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
    if (!draft || !selected.length) {
      return
    }
    const request: ReviewRequestPayload = author.pending[0]?.request ?? {
      ...draft,
      sender: '作者主机',
      cycleId: previous?.cycleId ?? crypto.randomUUID(),
      cycleStartedAt: previous?.cycleStartedAt ?? now,
      round: (previous?.round ?? 0) + 1,
      sentAt: now
    }
    const results = selected.map((target) => ({
      ...target,
      ok: !(partialFailure && target.environmentId === 'demo-other'),
      ...(partialFailure && target.environmentId === 'demo-other'
        ? { error: '主机连接已断开' }
        : {})
    }))
    if (!results.some((target) => target.ok)) {
      setAuthor((current) => ({ ...current, pending: [{ request, targets: selected }] }))
      setSendError(results.map((target) => target.name + '：' + target.error).join('；'))
      return
    }
    setAuthor((current) => {
      const next = recordSentReview(current, request, results)
      return { ...next, outgoing: next.outgoing.map((note) => ({ ...note, readback: readback() })) }
    })
    setReviewer((current) => {
      if (!selected.some((target) => target.environmentId === 'demo-reviewer')) {
        return current
      }
      const next = applyIncomingRequest(current, {
        ...request,
        senderId: 'demo-author',
        receivedAt: now
      })
      return { ...next, incoming: next.incoming.map((note) => ({ ...note, readback: readback() })) }
    })
    setDraft(null)
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
      <Toaster theme={dark ? 'dark' : 'light'} />
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
      <div className="fixed inset-x-0 top-0 z-50 flex min-h-12 flex-wrap items-center gap-2 border-b bg-background px-3 text-xs">
        <strong>原型演示工具</strong>
        <Button
          size="xs"
          variant="outline"
          onClick={() => {
            setCodehub(!codehub)
            setAuthor(EMPTY_REVIEW_NOTIFICATIONS)
            setReviewer(EMPTY_REVIEW_NOTIFICATIONS)
          }}
        >
          {codehub ? 'CodeHub MR' : 'GitHub PR'}
        </Button>
        <Button size="xs" variant="outline" onClick={() => setMissingProject(!missingProject)}>
          {missingProject ? '恢复项目访问' : '无项目访问'}
        </Button>
        <Button size="xs" variant="outline" onClick={() => setPartialFailure(!partialFailure)}>
          {partialFailure ? '恢复连接' : '模拟部分失败'}
        </Button>
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
              onSend={() => void openSend()}
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
            setOpenError(null)
          }}
        >
          重置
        </Button>
      </div>
      <PrReviewNotificationsView
        notifications={side === 'author' ? author : reviewer}
        error={openError}
        refreshing={false}
        onRefresh={() => {}}
        onError={setOpenError}
        onOpen={async () => {
          if (missingProject) {
            setOpenError('暂时无法访问该项目，通知已保留')
            toast.error('暂时无法访问该项目，通知已保留')
          } else {
            setOpenError(null)
            setDetail(true)
          }
        }}
        onDelete={(id) => setAuthor((s) => deleteOutgoingNote(s, id))}
        onResend={openSend}
        missingProject={() => missingProject}
      />
      {draft ? (
        <ReviewSendDialog
          request={draft}
          available={targets}
          selected={selected}
          loading={false}
          sending={false}
          error={sendError}
          onChange={setSelected}
          onClose={() => setDraft(null)}
          onSend={() => void send()}
        />
      ) : null}
      {detail && (
        <div className="fixed inset-x-1/4 top-1/3 z-40 rounded-lg border bg-card p-8 shadow-xl">
          <h2 className="text-lg font-semibold">沿用原生 PR / MR 详情</h2>
          <p className="my-4 text-sm text-muted-foreground">
            通知直接定位 PR / MR #383；评论、检视、合入和关闭沿用原生权限。此处不重画已有详情页。
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
