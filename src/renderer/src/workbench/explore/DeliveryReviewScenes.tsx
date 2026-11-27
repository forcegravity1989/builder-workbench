import { Check, CircleDot, GitBranch, GitPullRequest, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CreateHostedReviewComposer } from '@/components/right-sidebar/hosted-review/creation/CreateHostedReviewComposer'
import { CommitMessageComposer } from '@/components/right-sidebar/source-control/commit/commit-message-composer'
import { IncomingReviewItem } from '../pr-review-notifications/PrReviewNotificationItems'
import type { ReviewIncomingNote } from '../pr-review-notifications/model'
import { bookingIssue, ignore } from './DeliveryTaskScenes'

const source = 'issue-12-booking'
const file = 'src/booking.ts'
const reviewComment = '确认信息应从当前场次读取。请用另一场次重跑。'

function PullRequestComposer() {
  return (
    <div className="direction-demo-focus" data-delivery-action="pr-form">
      <CreateHostedReviewComposer
        provider="github"
        branch={source}
        base="main"
        setBase={ignore}
        repoDefaultBase="main"
        title={bookingIssue}
        setTitle={ignore}
        body={'关联 #12\n\n验证：预约后显示所选场次和地点。'}
        setBody={ignore}
        draft={false}
        setDraft={ignore}
        stackedCreationSupported={false}
        stackParentReview={null}
        baseQuery=""
        setBaseQuery={ignore}
        baseResults={[]}
        setBaseResults={ignore}
        baseSearchPending={false}
        baseSearchError={null}
        aiGenerationEnabled
        generating={false}
        generateDisabled={false}
        generateError={null}
        createError={null}
        isCreating={false}
        primaryAction={{ disabled: false, title: '创建 PR' }}
        onGenerate={ignore}
        onCancelGenerate={ignore}
        onPrimaryAction={ignore}
      />
    </div>
  )
}

function BookingDiff({
  revised = false,
  showComment = false
}: {
  revised?: boolean
  showComment?: boolean
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="bg-muted/50 px-3 py-1.5 font-mono">{file}</div>
      <div className="flex min-w-0 items-center gap-2 bg-emerald-500/10 px-2 py-1 font-mono">
        {showComment && (
          <Button
            data-delivery-action="line-comment"
            size="icon-xs"
            variant="outline"
            aria-label="添加检视评论"
          >
            <Plus size={12} />
          </Button>
        )}
        <span className="text-muted-foreground">24</span>
        <code className="min-w-0 break-words">
          + return{' '}
          {revised ? 'bookingConfirmation(selectedSlot)' : 'bookingConfirmation(defaultSlot)'}
        </code>
      </div>
    </div>
  )
}

export function DeliveryPrepareDemo({ time }: { time: number }) {
  if (time >= 9500) {
    return <PullRequestComposer />
  }
  const opened = time >= 1400
  const validated = time >= 3950
  const staged = time >= 5550
  const committed = time >= 7750
  return (
    <div className="direction-demo-window overflow-hidden text-xs">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <strong>源代码管理</strong>
        <span className="flex items-center gap-1">
          <GitBranch size={14} /> {source}
        </span>
      </div>
      <div className="space-y-2.5 p-3">
        {!committed && (
          <>
            <div className="flex items-center justify-between gap-2">
              <Button data-delivery-action="file" size="xs" variant="ghost" className="font-mono">
                {file}
              </Button>
              <Button data-delivery-action="stage" size="xs" variant="outline">
                {staged ? '已暂存' : '暂存更改'}
              </Button>
            </div>
            {opened && <BookingDiff />}
            {opened && (
              <div className="rounded-md bg-muted p-2 font-mono" data-delivery-action="verify">
                <div>$ npm test -- booking</div>
                {validated && <div>PASS booking.test.ts · 2 passed</div>}
              </div>
            )}
            {staged && (
              <>
                <div data-delivery-action="commit-message">
                  <CommitMessageComposer
                    rows={1}
                    commitMessage={time >= 6350 ? '实现预约与场次确认' : ''}
                    disabled={false}
                    onCommitMessageChange={ignore}
                    describedBy=""
                    showGenerate
                    isGenerating={false}
                    onCancelGenerate={ignore}
                    isGenerateDisabled={false}
                    onGenerate={ignore}
                  />
                </div>
                <Button data-delivery-action="commit" size="xs">
                  提交
                </Button>
              </>
            )}
          </>
        )}
        {committed && (
          <Button data-delivery-action="push" size="xs">
            推送
          </Button>
        )}
      </div>
    </div>
  )
}

export function DeliveryReviewDemo({ time }: { time: number }) {
  const open = time >= 1550
  const reviewingFiles = time >= 4300 && time < 8350
  const checking = (time >= 2750 && time < 4300) || time >= 14150
  const editing = time >= 10300 && time < 14150
  const replying = time >= 5900 && time < 7650
  const posted = time >= 7650
  return (
    <div className="direction-demo-window overflow-hidden text-xs">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <GitPullRequest size={14} />
        <Button data-delivery-action="open-pr" size="xs" variant="ghost">
          {open ? 'PR #16' : '任务 → PR #16'} · {bookingIssue}
        </Button>
        {open && (
          <span className="ml-auto flex items-center gap-1">
            <CircleDot size={13} /> 开放
          </span>
        )}
      </div>
      {open && !editing && (
        <Tabs value={reviewingFiles ? 'files' : checking ? 'checks' : 'conversation'}>
          <TabsList variant="line" className="ml-3">
            <TabsTrigger data-delivery-action="conversation" value="conversation">
              对话
            </TabsTrigger>
            <TabsTrigger data-delivery-action="checks" value="checks">
              检查项
            </TabsTrigger>
            <TabsTrigger data-delivery-action="files" value="files">
              文件
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      {open && (
        <div className="space-y-2.5 p-3">
          {checking && (
            <div className="flex items-center gap-2 rounded-md border border-border p-2.5">
              {time >= 14150 && time < 15300 ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Check size={14} className="text-emerald-600" />
              )}
              {time >= 14150 && time < 15300
                ? 'booking-tests · 正在运行'
                : 'booking-tests · 已通过'}
              {time >= 14150 && <code className="ml-auto">c71d615 · 最新提交</code>}
            </div>
          )}
          {reviewingFiles && <BookingDiff showComment />}
          {replying && (
            <>
              <textarea
                readOnly
                className="w-full resize-none rounded-md border border-input bg-background p-1.5"
                value={reviewComment.slice(0, Math.floor((time - 5900) / 35))}
              />
              <Button data-delivery-action="post-comment" size="xs">
                评论
              </Button>
            </>
          )}
          {posted && !checking && (
            <div className="rounded-md border border-border p-2.5">
              <strong>陈晓 · {file}:24</strong>
              <p className="mt-1">{reviewComment}</p>
            </div>
          )}
          {posted && !checking && !reviewingFiles && !editing && (
            <Button data-delivery-action="resume-edit" size="xs" variant="outline">
              打开工作区
            </Button>
          )}
          {editing && (
            <>
              <BookingDiff revised={time >= 11400} />
              {time >= 12000 && (
                <p className="rounded-md bg-muted p-2 font-mono">npm test -- booking · 3 passed</p>
              )}
              <Button data-delivery-action="push-revision" size="xs">
                推送
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function DeliveryNotifyDemo({ time }: { time: number }) {
  return (
    <div className="direction-demo-focus space-y-3 text-sm">
      {time < 1500 ? (
        <>
          <p className="font-medium">管理远程主机</p>
          <p className="text-xs text-muted-foreground">一端分享访问链接，另一端粘贴并连接。</p>
          <div className="flex flex-wrap gap-2">
            <Button data-delivery-action="pair-host" variant="outline" size="xs">
              连接到主机
            </Button>
            <Button variant="ghost" size="xs">
              分享此主机
            </Button>
          </div>
        </>
      ) : time < 3500 ? (
        <>
          <p className="font-medium">工作区 · {bookingIssue}</p>
          <Button data-delivery-action="review-notify" variant="ghost" size="sm">
            发送评审…
          </Button>
          <p className="text-xs text-muted-foreground">陈晓的主机 · 已连接</p>
        </>
      ) : (
        <>
          <h4 className="font-semibold">发送评审</h4>
          <p className="text-xs text-muted-foreground">
            example/book-exchange #16 · {bookingIssue}
          </p>
          <label
            className="flex items-center gap-2 rounded-md border border-border p-2 text-xs"
            data-delivery-action="review-host"
          >
            <input type="checkbox" checked={time >= 4850} readOnly /> 陈晓的主机
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="xs">
              取消
            </Button>
            <Button disabled={time < 4850} size="xs">
              发送至 1 台主机
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

const sampleNotificationTime = '2026-11-13T10:00:00Z'
const inboxReview: ReviewIncomingNote = {
  id: 'sample-book-exchange-16',
  repo: { host: 'github.com', path: 'example/book-exchange' },
  prNumber: 16,
  title: bookingIssue,
  sourceBranch: source,
  targetBranch: 'main',
  sender: '林小满',
  senderId: 'sample-sender',
  cycleId: '7f2e97b8-0637-4f38-93ea-fdb57ff7feee',
  cycleStartedAt: sampleNotificationTime,
  round: 1,
  sentAt: sampleNotificationTime,
  receivedAt: sampleNotificationTime,
  readback: {
    openCommentCount: 0,
    merged: false,
    prState: 'open',
    checksState: 'success',
    checkedAt: sampleNotificationTime
  },
  readbackError: null
}

export function DeliveryReceiveReviewDemo({ time }: { time: number }) {
  if (time >= 5800) {
    return <DeliveryReviewDemo time={2850} />
  }
  const connected = time >= 3700
  return (
    <div className="direction-demo-focus space-y-3 text-sm">
      <h4 className="font-semibold">待我评审</h4>
      <div data-delivery-action="open-notification">
        <IncomingReviewItem
          note={inboxReview}
          missingProject={!connected}
          onOpen={ignore}
          onDismiss={ignore}
        />
      </div>
      {!connected && (
        <>
          <p className="text-xs text-muted-foreground">暂时无法访问该项目</p>
          <Button data-delivery-action="resume-host" variant="outline" size="xs">
            管理远程主机 · 连接
          </Button>
        </>
      )}
    </div>
  )
}
