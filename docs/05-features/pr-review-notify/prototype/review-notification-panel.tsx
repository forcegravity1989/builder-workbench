import type React from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  Bell,
  ExternalLink,
  FilePenLine,
  GitPullRequest,
  Inbox,
  RotateCw,
  Send,
  Trash2,
  X
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export type Host = { id: string; name: string; worktree: string; member: string; shared: boolean }
export type Note = { id: string; target: string; text: string; member: string; host: string }
export type PrototypeReviewItem = { id: string; title: string; tags: string[]; meta: string }

type Props = {
  notificationCount: number
  notificationsOpen: boolean
  setNotificationsOpen: Dispatch<SetStateAction<boolean>>
  notificationTab: 'pr' | 'prototype'
  setNotificationTab: Dispatch<SetStateAction<'pr' | 'prototype'>>
  prOutgoing: boolean
  setPrOutgoing: Dispatch<SetStateAction<boolean>>
  prEvent: boolean
  setPrEvent: Dispatch<SetStateAction<boolean>>
  prototypeOutgoing: PrototypeReviewItem[]
  prototypeIncoming: PrototypeReviewItem[]
  dismissPrototype: (id: string) => void
  openPrototype: () => void
}

export function ReviewNotificationPanel({
  notificationCount,
  notificationsOpen,
  setNotificationsOpen,
  notificationTab,
  setNotificationTab,
  prOutgoing,
  setPrOutgoing,
  prEvent,
  setPrEvent,
  prototypeOutgoing,
  prototypeIncoming,
  dismissPrototype,
  openPrototype
}: Props): React.JSX.Element {
  return (
    <div className="fixed right-5 bottom-5 z-40">
      <Button
        size="icon"
        variant="outline"
        className="relative rounded-lg shadow-lg"
        onClick={() => setNotificationsOpen((value) => !value)}
        title="评审通知"
      >
        <GitPullRequest className="size-4" />
        {notificationCount ? (
          <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-amber-500 px-1 text-[10px] font-semibold leading-4 text-white">
            {notificationCount > 99 ? '99+' : notificationCount}
          </span>
        ) : null}
      </Button>
      {notificationsOpen ? (
        <div className="absolute right-0 bottom-12 flex max-h-[28rem] w-80 flex-col rounded-lg border bg-card text-xs shadow-xl">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="flex items-center gap-1.5 font-medium">
              <Bell className="size-3.5" />
              评审通知
            </div>
            <div className="flex items-center gap-1">
              <span className="px-1 text-[11px] text-muted-foreground">{notificationCount} 条</span>
              <Button
                size="icon-xs"
                variant="ghost"
                className="size-6"
                title="刷新评审动态"
                onClick={() => toast.success('评审动态已刷新')}
              >
                <RotateCw className="size-3" />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                className="size-6"
                title="关闭"
                onClick={() => setNotificationsOpen(false)}
              >
                <X className="size-3" />
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="mb-3 flex border-b">
              <button
                type="button"
                className={`flex-1 border-b-2 px-2 py-2 text-center font-medium ${notificationTab === 'pr' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground'}`}
                onClick={() => setNotificationTab('pr')}
              >
                PR 评审
              </button>
              <button
                type="button"
                className={`flex-1 border-b-2 px-2 py-2 text-center font-medium ${notificationTab === 'prototype' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground'}`}
                onClick={() => setNotificationTab('prototype')}
              >
                原型评审
              </button>
            </div>
            {notificationTab === 'pr' ? (
              <div className="flex flex-col gap-3">
                <section className="rounded border p-2.5">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Send className="size-3" />
                      我发出的评审
                    </div>
                    <span className="text-[11px] text-muted-foreground">{prOutgoing ? 1 : 0}</span>
                  </div>
                  {prOutgoing ? (
                    <div className="border-b border-border/50 pb-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          className="flex min-w-0 items-center gap-1.5 text-left font-semibold text-muted-foreground hover:text-foreground"
                          onClick={() => toast.success('已打开原生 PR #383 详情')}
                        >
                          <GitPullRequest className="size-3 shrink-0" />
                          PR #383
                        </button>
                        <div className="flex gap-0.5">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            title="打开评审详情"
                            onClick={() => toast.success('已打开原生 PR #383 详情')}
                          >
                            <ExternalLink className="size-3" />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            title="删除这条评审通知"
                            onClick={() => setPrOutgoing(false)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="mt-1 w-full text-left text-[13px] font-semibold hover:text-primary"
                        onClick={() => toast.success('已打开原生 PR #383 详情')}
                      >
                        请求评审 PR #383 · 第 1 轮
                      </button>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className="rounded border px-1.5 py-0.5 text-[10px]">PR</span>
                        <span className="rounded border px-1.5 py-0.5 text-[10px]">
                          Checks 通过
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        example/workbench-demo · 发送于刚刚 · 自动同步
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        评审主机 · 已送达
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      {notificationCount ? '暂无发出的评审' : '在工作树上右键可发送评审'}
                    </p>
                  )}
                </section>
                <section className="rounded border p-2.5">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Inbox className="size-3" />
                      待我评审
                    </div>
                    <span className="text-[11px] text-muted-foreground">{prEvent ? 1 : 0}</span>
                  </div>
                  {prEvent ? (
                    <div className="border-b border-border/50 pb-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          className="flex min-w-0 items-center gap-1.5 text-left font-semibold text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setNotificationsOpen(false)
                            toast.success('已打开原生 PR #383 详情')
                          }}
                        >
                          <GitPullRequest className="size-3 shrink-0" />
                          PR #383
                        </button>
                        <div className="flex gap-0.5">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            title="打开评审详情"
                            onClick={() => {
                              setNotificationsOpen(false)
                              toast.success('已打开原生 PR #383 详情')
                            }}
                          >
                            <ExternalLink className="size-3" />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            title="删除这条评审通知"
                            onClick={() => setPrEvent(false)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="group mt-1 flex w-full flex-col gap-1.5 text-left"
                        onClick={() => {
                          setNotificationsOpen(false)
                          toast.success('已打开原生 PR #383 详情')
                        }}
                      >
                        <span className="text-[13px] font-semibold group-hover:text-primary">
                          林安请求评审 PR #383
                        </span>
                        <span className="flex flex-wrap gap-1">
                          <span className="rounded border px-1.5 py-0.5 text-[10px]">PR</span>
                          <span className="rounded border px-1.5 py-0.5 text-[10px]">第 1 轮</span>
                        </span>
                        <span className="flex flex-wrap gap-x-1.5 text-[11px] text-muted-foreground">
                          example/workbench-demo · 林安 · 刚刚
                        </span>
                      </button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">暂无待我评审的请求</p>
                  )}
                </section>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <PrototypeSection
                  icon={Send}
                  title="我发出的评审"
                  empty="暂无发出的原型评审"
                  items={prototypeOutgoing}
                  dismissPrototype={dismissPrototype}
                  openPrototype={openPrototype}
                />
                <PrototypeSection
                  icon={Inbox}
                  title="待我评审"
                  empty="暂无待我评审的原型"
                  items={prototypeIncoming}
                  dismissPrototype={dismissPrototype}
                  openPrototype={openPrototype}
                />
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function PrototypeSection({
  icon: Icon,
  title,
  empty,
  items,
  dismissPrototype,
  openPrototype
}: {
  icon: typeof Send
  title: string
  empty: string
  items: PrototypeReviewItem[]
  dismissPrototype: (id: string) => void
  openPrototype: () => void
}): React.JSX.Element {
  return (
    <section className="rounded border p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-medium">
          <Icon className="size-3" />
          {title}
        </div>
        <span className="text-[11px] text-muted-foreground">{items.length}</span>
      </div>
      {items.length ? (
        items.map((item) => (
          <div key={item.id} className="border-b border-border/50 pb-2.5">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="flex min-w-0 items-center gap-1.5 text-left font-semibold text-muted-foreground hover:text-foreground"
                onClick={openPrototype}
              >
                <FilePenLine className="size-3 shrink-0" />
                原型评审
              </button>
              <div className="flex gap-0.5">
                <Button
                  size="icon-xs"
                  variant="ghost"
                  title="在我的预览中打开文档"
                  onClick={openPrototype}
                >
                  <ExternalLink className="size-3" />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  title="删除这条评审通知"
                  onClick={() => dismissPrototype(item.id)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </div>
            <button
              type="button"
              className="group mt-1 flex w-full flex-col gap-1.5 text-left"
              onClick={openPrototype}
            >
              <span className="text-[13px] font-semibold group-hover:text-primary">
                {item.title}
              </span>
              <span className="flex flex-wrap gap-1">
                {item.tags.map((tag) => (
                  <span key={tag} className="rounded border px-1.5 py-0.5 text-[10px]">
                    {tag}
                  </span>
                ))}
              </span>
              <span className="text-[11px] text-muted-foreground">{item.meta}</span>
            </button>
          </div>
        ))
      ) : (
        <p className="text-[11px] text-muted-foreground">{empty}</p>
      )}
    </section>
  )
}
