import React, { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster, toast } from 'sonner'
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Crosshair,
  FilePenLine,
  FolderGit2,
  LayoutGrid,
  Lock,
  MessageSquarePlus,
  Pencil,
  RefreshCw,
  Send,
  Server,
  Settings2,
  Terminal,
  UsersRound
} from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { ReviewSendDialog } from '@/workbench/pr-review-notifications/ReviewSendDialog'
import { ReviewSendMenuItem } from '@/workbench/pr-review-notifications/ReviewSendMenuItem'
import {
  ReviewNotificationPanel,
  type Host,
  type PrototypeEvent
} from './review-notification-panel'
import type {
  ReviewPeerTarget,
  ReviewSendInput
} from '../../../../src/shared/workbench/pr-review-request'
import { i18n } from '@/i18n/i18n'

const hosts: Host[] = [
  {
    id: 'host-linan',
    name: '林安的主机',
    worktree: 'issue-184-export',
    member: '林安',
    shared: true
  },
  {
    id: 'host-hanlan',
    name: '韩岚的主机',
    worktree: 'issue-201-review',
    member: '韩岚',
    shared: false
  },
  {
    id: 'host-chenyuan',
    name: '陈远的主机',
    worktree: 'issue-192-import',
    member: '陈远',
    shared: true
  }
]
const targets: ReviewPeerTarget[] = hosts.map((host) => ({
  environmentId: host.id,
  name: host.name,
  pairingRevision: 1
}))

function Preview(): React.JSX.Element {
  const [activeHostId, setActiveHostId] = useState('host-hanlan')
  const [activeTab, setActiveTab] = useState<'session' | 'browser'>('browser')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notificationTab, setNotificationTab] = useState<'pr' | 'prototype'>('pr')
  const [prototypeEvent, setPrototypeEvent] = useState<PrototypeEvent>({
    revision: '原型修订 3',
    sessionId: 'shared-review-tab-1',
    source: hosts[0],
    notes: [],
    sentToModel: false
  })
  const [prototypeNotification, setPrototypeNotification] = useState(false)
  const [prEvent, setPrEvent] = useState(true)
  const [prOutgoing, setPrOutgoing] = useState(true)
  const [prototypeOutgoing, setPrototypeOutgoing] = useState(false)
  const [annotationMode, setAnnotationMode] = useState(false)
  const [annotationTarget, setAnnotationTarget] = useState<string | null>(null)
  const [annotationText, setAnnotationText] = useState('')
  const [sendKind, setSendKind] = useState<'pr' | 'prototype'>('pr')
  const [draft, setDraft] = useState<ReviewSendInput | null>(null)
  const [selectedTargets, setSelectedTargets] = useState<ReviewPeerTarget[]>(targets)

  const activeHost = hosts.find((host) => host.id === activeHostId) ?? hosts[0]
  const sourceHost = prototypeEvent?.source ?? hosts[0]
  const reviewerHost = hosts.find((host) => host.id === 'host-hanlan') ?? hosts[1]
  const inSharedReview = activeHost.shared
  const canAnnotate = inSharedReview
  const notificationCount =
    Number(prEvent) + Number(prOutgoing) + Number(prototypeNotification) + Number(prototypeOutgoing)

  const openSend = (kind: 'pr' | 'prototype'): void => {
    setSendKind(kind)
    setSelectedTargets(kind === 'prototype' ? [targets[1]] : targets)
    setDraft({
      repo: { host: 'github.com', path: 'example/workbench-demo' },
      prNumber: 383,
      title: kind === 'prototype' ? '原型评审 · 原型修订 3' : '通知：打通评审旅程',
      sourceBranch: 'feature/review',
      targetBranch: 'main'
    })
  }

  const send = (): void => {
    if (!draft || selectedTargets.length === 0) {
      return
    }
    if (sendKind === 'prototype') {
      setPrototypeNotification(true)
      setPrototypeOutgoing(true)
      setDraft(null)
      toast.success('原型评审通知已送达')
      return
    }
    setPrEvent(true)
    setPrOutgoing(true)
    setDraft(null)
    toast.success('PR 评审通知已送达')
  }

  const jumpToPrototype = (): void => {
    setActiveHostId(prototypeEvent.source.id)
    setActiveTab('browser')
    setNotificationsOpen(false)
    toast.success(`已跳转到${prototypeEvent.source.name} · ${prototypeEvent.source.worktree}`)
  }

  const addAnnotation = (): void => {
    const text = annotationText.trim()
    if (!annotationTarget || !text) {
      return
    }
    const next: Note = {
      id: crypto.randomUUID(),
      target: annotationTarget,
      text,
      member: reviewerHost.member,
      host: reviewerHost.name
    }
    setPrototypeEvent((current) =>
      current ? { ...current, notes: [...current.notes, next] } : current
    )
    setAnnotationTarget(null)
    setAnnotationText('')
    setAnnotationMode(false)
    toast.success('批注已写入同一评审页签')
  }

  const treeRows = useMemo(
    () => [
      { label: '星图服务', detail: activeHost.worktree, icon: FolderGit2 },
      { label: 'v1.1', detail: '版本工作区', icon: FolderGit2 },
      { label: '评审与发布', detail: '当前会话', icon: Terminal }
    ],
    [activeHost.worktree]
  )

  return (
    <TooltipProvider>
      <Toaster />
      <div className="flex h-screen flex-col bg-background text-foreground">
        <div className="flex h-10 shrink-0 items-center gap-3 border-b px-3 text-xs">
          <strong className="flex items-center gap-1.5">
            <LayoutGrid className="size-3.5" />
            Workbench
          </strong>
          <span className="text-muted-foreground">/</span>
          <span>星图服务</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-muted-foreground">当前查看主机</span>
            <select
              className="input h-7 w-44"
              value={activeHost.id}
              onChange={(event) => setActiveHostId(event.target.value)}
            >
              {hosts.map((host) => (
                <option key={host.id} value={host.id}>
                  {host.name}
                </option>
              ))}
            </select>
            <span className="rounded bg-muted px-2 py-1 text-muted-foreground">
              <Server className="mr-1 inline size-3" />
              {activeHost.worktree}
            </span>
            <Button size="icon-xs" variant="ghost" title="设置">
              <Settings2 className="size-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-14 shrink-0 flex-col items-center gap-2 border-r bg-worktree-sidebar py-2">
            <Button size="icon-sm" variant="default" title="项目墙">
              <LayoutGrid className="size-4" />
            </Button>
            <Button size="icon-sm" variant="secondary" title="版本工作区">
              <FolderGit2 className="size-4" />
            </Button>
            <Button size="icon-sm" variant="ghost" title="团队协作">
              <UsersRound className="size-4" />
            </Button>
            <div className="mt-auto">
              <Button size="icon-sm" variant="ghost" title="远程主机">
                <Server className="size-4" />
              </Button>
            </div>
          </aside>
          <aside className="flex w-64 shrink-0 flex-col border-r bg-worktree-sidebar">
            <div className="border-b px-3 py-3">
              <div className="text-xs text-muted-foreground">当前项目</div>
              <strong>星图服务</strong>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {activeHost.name} · 只读查看
              </div>
            </div>
            <div className="flex-1 p-2 text-xs">
              <div className="mb-2 px-2 text-[11px] text-muted-foreground">工作区</div>
              {treeRows.map(({ label, detail, icon: Icon }, index) => (
                <button
                  key={label}
                  type="button"
                  className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-2 text-left ${index === 2 ? 'bg-worktree-sidebar-accent' : 'hover:bg-worktree-sidebar-accent'}`}
                  onClick={() => index === 2 && setActiveTab('session')}
                >
                  <Icon className="size-3.5 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate">{label}</strong>
                    <small className="text-muted-foreground">{detail}</small>
                  </span>
                </button>
              ))}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="mt-2 w-full justify-start" size="sm" variant="outline">
                    <Send className="mr-2 size-3.5" />
                    发送评审…
                    <ChevronDown className="ml-auto size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <ReviewSendMenuItem disabled={false} onSend={() => openSend('pr')} />
                  <DropdownMenuItem onSelect={() => openSend('prototype')}>
                    <FilePenLine className="size-3.5" />
                    原型评审…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="border-t p-2">
              <Button className="w-full justify-start" size="sm" variant="ghost">
                <Terminal className="mr-2 size-3.5" />
                新建会话
              </Button>
            </div>
          </aside>
          <main className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-12 items-center gap-2 border-b px-4">
              <div className="flex items-center gap-1">
                <Button size="icon-xs" variant="ghost">
                  <ArrowLeft className="size-3.5" />
                </Button>
                <Button size="icon-xs" variant="ghost">
                  <ArrowRight className="size-3.5" />
                </Button>
                <Button size="icon-xs" variant="ghost">
                  <RefreshCw className="size-3.5" />
                </Button>
              </div>
              <div className="min-w-0 flex-1 rounded border bg-muted px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                workbench://星图服务/{activeHost.worktree}/prototype
              </div>
              <span className="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                <Lock className="mr-1 inline size-3" />
                只读
              </span>
            </div>
            <div className="flex h-9 items-center gap-1 border-b px-3">
              <Button
                size="xs"
                variant={activeTab === 'session' ? 'secondary' : 'ghost'}
                onClick={() => setActiveTab('session')}
              >
                <Terminal className="mr-1 size-3" />
                会话
              </Button>
              <Button
                size="xs"
                variant={activeTab === 'browser' ? 'secondary' : 'ghost'}
                onClick={() => setActiveTab('browser')}
              >
                <LayoutGrid className="mr-1 size-3" />
                浏览器
              </Button>
              {inSharedReview ? (
                <span className="ml-2 text-[11px] text-muted-foreground">
                  共享页签：{prototypeEvent?.sessionId} · 2 人
                </span>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-muted/20 p-4">
              {activeTab === 'session' ? (
                <div className="mx-auto max-w-3xl rounded-lg border bg-card p-6">
                  <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
                    <Terminal className="size-4" />
                    {activeHost.name} · {activeHost.worktree}
                  </div>
                  <h1 className="text-lg font-semibold">评审与发布</h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    当前会话沿用 BW 工作区；从通知进入原型评审后，浏览器页签固定在同一主机和工作树。
                  </p>
                </div>
              ) : (
                <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                  <section className="rounded-lg border bg-card p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <strong>共享浏览器</strong>
                        <p className="text-xs text-muted-foreground">
                          {inSharedReview
                            ? `${activeHost.name} · 共享只读主机 · 批注按钮按目标状态启用`
                            : `${activeHost.name} · 本机页签`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          className="h-8 w-8"
                          variant="ghost"
                          title="抓取页面元素"
                        >
                          <Crosshair className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          className="relative h-8 w-8"
                          variant={canAnnotate && annotationMode ? 'default' : 'ghost'}
                          disabled={!canAnnotate}
                          title={canAnnotate ? '批注页面元素' : '共享浏览器批注不可用'}
                          onClick={() => setAnnotationMode((value) => !value)}
                        >
                          <MessageSquarePlus className="size-4" />
                          {prototypeEvent?.notes.length ? (
                            <span className="absolute ml-5 -mt-5 min-w-3 rounded-full bg-primary px-1 text-[9px] text-primary-foreground">
                              {prototypeEvent.notes.length}
                            </span>
                          ) : null}
                        </Button>
                        <Button size="icon" className="h-8 w-8" variant="ghost" title="绘制标记">
                          <Pencil className="size-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-md border bg-background p-5">
                      <div className="mb-5 rounded border bg-gradient-to-br from-primary/10 to-background p-6">
                        <span className="text-xs text-muted-foreground">原型内容 · 示例快照</span>
                        <h2 className="mt-2 text-xl font-semibold">这里是原型页面内容</h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                          原型内容弱化展示；本评审关注工作区、主机、浏览器页签和批注入口。
                        </p>
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={!annotationMode}
                          onClick={() => setAnnotationTarget('首屏说明')}
                        >
                          批注首屏说明
                        </Button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded border p-4">
                          <strong className="text-sm">项目来源</strong>
                          <p className="mt-1 text-xs text-muted-foreground">
                            主机来源和项目身份保持一致。
                          </p>
                          <Button
                            size="xs"
                            variant="outline"
                            className="mt-3"
                            disabled={!annotationMode}
                            onClick={() => setAnnotationTarget('项目来源')}
                          >
                            批注此处
                          </Button>
                        </div>
                        <div className="rounded border p-4">
                          <strong className="text-sm">下一步</strong>
                          <p className="mt-1 text-xs text-muted-foreground">
                            连接默认只读，授权由主机持有人决定。
                          </p>
                          <Button
                            size="xs"
                            variant="outline"
                            className="mt-3"
                            disabled={!annotationMode}
                            onClick={() => setAnnotationTarget('下一步')}
                          >
                            批注此处
                          </Button>
                        </div>
                      </div>
                    </div>
                    {annotationTarget ? (
                      <div className="mt-3 rounded border bg-background p-3">
                        <div className="text-xs font-medium">
                          批注「{annotationTarget}」 · {reviewerHost.name}
                        </div>
                        <textarea
                          className="input mt-2 min-h-20 w-full"
                          value={annotationText}
                          onChange={(event) => setAnnotationText(event.target.value)}
                          placeholder="输入批注"
                        />
                        <div className="mt-2 flex justify-end gap-2">
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => setAnnotationTarget(null)}
                          >
                            取消
                          </Button>
                          <Button
                            size="xs"
                            disabled={!annotationText.trim()}
                            onClick={addAnnotation}
                          >
                            提交批注
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </section>
                  <aside className="rounded-lg border bg-card p-3">
                    <div className="flex items-center justify-between">
                      <strong className="text-sm">评审批注</strong>
                      <span className="text-xs text-muted-foreground">
                        {prototypeEvent?.notes.length ?? 0} 条
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      同一浏览器页签汇总，批注显示成员和来源主机。
                    </p>
                    <div className="mt-3 space-y-2">
                      {prototypeEvent?.notes.length ? (
                        prototypeEvent.notes.map((note) => (
                          <div key={note.id} className="rounded border p-2 text-xs">
                            <strong>{note.target}</strong>
                            <p className="mt-1">{note.text}</p>
                            <small className="text-muted-foreground">
                              {note.member} · {note.host}
                            </small>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">暂无批注</p>
                      )}
                    </div>
                    {prototypeEvent && activeHost.id === sourceHost.id ? (
                      <Button
                        className="mt-4 w-full"
                        size="sm"
                        disabled={!prototypeEvent.notes.length || prototypeEvent.sentToModel}
                        onClick={() => {
                          setPrototypeEvent((current) =>
                            current ? { ...current, sentToModel: true } : current
                          )
                          toast.success('批注已发送给发起人的工作模型')
                        }}
                      >
                        {prototypeEvent.sentToModel ? '已发送给工作模型' : '发送给我的工作模型'}
                      </Button>
                    ) : null}
                  </aside>
                </div>
              )}
            </div>
          </main>
        </div>
        <ReviewNotificationPanel
          notificationCount={notificationCount}
          notificationsOpen={notificationsOpen}
          setNotificationsOpen={setNotificationsOpen}
          notificationTab={notificationTab}
          setNotificationTab={setNotificationTab}
          prOutgoing={prOutgoing}
          setPrOutgoing={setPrOutgoing}
          prEvent={prEvent}
          setPrEvent={setPrEvent}
          prototypeOutgoing={prototypeOutgoing}
          setPrototypeOutgoing={setPrototypeOutgoing}
          prototypeNotification={prototypeNotification}
          setPrototypeNotification={setPrototypeNotification}
          prototypeEvent={prototypeEvent}
          jumpToPrototype={jumpToPrototype}
        />
      </div>
      {draft ? (
        <ReviewSendDialog
          request={draft}
          available={targets}
          selected={selectedTargets}
          loading={false}
          sending={false}
          error={null}
          onChange={setSelectedTargets}
          onClose={() => setDraft(null)}
          onSend={send}
        />
      ) : null}
    </TooltipProvider>
  )
}

void i18n
  .changeLanguage('zh')
  .then(() => createRoot(document.getElementById('root')!).render(<Preview />))
