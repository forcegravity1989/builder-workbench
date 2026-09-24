import { useEffect, useState } from 'react'
import type { TaskPageComposerActionsModel } from '../../use-task-page-composer-actions'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowRight,
  Check,
  ChevronLeft,
  CircleDashed,
  CircleDot,
  Copy,
  ExternalLink,
  GitPullRequest,
  ListChecks,
  LoaderCircle,
  MessageSquare,
  Pencil,
  Trash2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { formatRelativeTime } from '../../task-page-source-context'
import type { CodeHubComment, CodeHubTaskDetail } from '../../../../../shared/codehub-tasks'
import { TaskPageCodeHubActions } from './Actions'

export function TaskPageCodeHubDetail({
  model
}: {
  model: TaskPageComposerActionsModel
}): React.JSX.Element | null {
  const { codehubDetailItem, setCodehubDetailItem, handleUseCodeHubItem, setCodehubRefreshNonce } =
    model
  const item = codehubDetailItem
  const [detail, setDetail] = useState<CodeHubTaskDetail | null>(null)
  const [comments, setComments] = useState<CodeHubComment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState('conversation')
  const [commentError, setCommentError] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [savingTitle, setSavingTitle] = useState(false)
  const [stateBusy, setStateBusy] = useState(false)
  const [duplicateOf, setDuplicateOf] = useState('')
  const reloadDetail = (): void => {
    if (!item?.repoPath) {
      return
    }
    const args = { repoPath: item.repoPath, repoId: item.repoId, kind: item.type, iid: item.iid }
    void window.api.codehub
      .viewTask(args)
      .then((next) => {
        setDetail(next)
        setError(null)
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason))
      })
    void window.api.codehub
      .listComments(args)
      .then((rows) => {
        setComments(rows)
        setCommentError(null)
      })
      .catch((reason: unknown) => {
        setComments([])
        setCommentError(reason instanceof Error ? reason.message : String(reason))
      })
    setCodehubRefreshNonce((nonce) => nonce + 1)
  }
  useEffect(() => {
    if (!item?.repoPath) {
      return
    }
    let stale = false
    setDetail(null)
    setComments([])
    setError(null)
    setCommentError(null)
    setEditingTitle(false)
    setTab('conversation')
    const args = { repoPath: item.repoPath, repoId: item.repoId, kind: item.type, iid: item.iid }
    void window.api.codehub
      .viewTask(args)
      .then((next) => {
        if (!stale) {
          setDetail(next)
        }
      })
      .catch((reason: unknown) => {
        if (!stale) {
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      })
    void window.api.codehub.listComments(args).then((rows) => {
      if (!stale) {
        setComments(rows)
        setCommentError(null)
      }
    }).catch((reason: unknown) => {
      if (!stale) {
        setComments([])
        setCommentError(reason instanceof Error ? reason.message : String(reason))
      }
    })
    return () => {
      stale = true
    }
  }, [item])
  if (!item) {
    return null
  }
  const title = detail?.title || item.title
  const visibleState = (detail?.state ?? item.state).toLowerCase()
  const closed = visibleState === 'closed' || visibleState === 'merged'
  const actionItem = {
    ...item,
    title,
    state: (visibleState === 'merged' ? 'merged' : visibleState === 'closed' ? 'closed' : 'opened') as
      | 'opened'
      | 'closed'
      | 'merged'
  }
  const backLabel =
    item.type === 'mr'
      ? translate('auto.components.TaskPage.137e2a8a01', 'PRs')
      : translate('auto.components.TaskPage.dfc0c79bd8', 'Issues')
  const projectLabel = item.project ?? ''
  const postComment = (): void => {
    const body = draft.trim()
    if (!item.repoPath || !body || posting) {
      return
    }
    setPosting(true)
    void window.api.codehub
      .createComment({ repoPath: item.repoPath, repoId: item.repoId, kind: item.type, iid: item.iid, body })
      .then(() =>
        window.api.codehub.listComments({
          repoPath: item.repoPath!,
          repoId: item.repoId,
          kind: item.type,
          iid: item.iid
        })
      )
      .then((rows) => {
        setComments(rows)
        setDraft('')
      })
      .catch((reason: unknown) => {
        toast.error(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => setPosting(false))
  }
  const saveTitle = (): void => {
    const nextTitle = titleDraft.trim()
    if (!item.repoPath || !nextTitle || savingTitle || nextTitle === title) {
      setEditingTitle(false)
      return
    }
    setSavingTitle(true)
    void window.api.codehub
      .updateIssueTitle({
        repoPath: item.repoPath,
        repoId: item.repoId,
        iid: item.iid,
        title: nextTitle
      })
      .then(() => {
        setEditingTitle(false)
        toast.success(translate('auto.components.TaskPage.codehubTitleSaved', 'Title updated'))
        reloadDetail()
      })
      .catch((reason: unknown) => {
        toast.error(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => setSavingTitle(false))
  }
  const setIssueState = (
    state: 'open' | 'closed',
    stateReason?: 'completed' | 'not_planned' | 'duplicate'
  ): void => {
    if (!item.repoPath || stateBusy) {
      return
    }
    const duplicate = Number(duplicateOf)
    if (stateReason === 'duplicate' && !Number.isInteger(duplicate)) {
      return
    }
    setStateBusy(true)
    void window.api.codehub
      .setIssueState({
        repoPath: item.repoPath,
        repoId: item.repoId,
        iid: item.iid,
        state,
        stateReason,
        duplicateOf: stateReason === 'duplicate' ? duplicate : null
      })
      .then(() => {
        toast.success(
          state === 'open'
            ? translate('auto.components.TaskPage.codehubIssueReopened', 'Issue reopened')
            : translate('auto.components.TaskPage.codehubIssueClosed', 'Issue closed')
        )
        reloadDetail()
      })
      .catch((reason: unknown) => {
        toast.error(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => setStateBusy(false))
  }
  const conversation = (
    <div className="w-full px-2 py-6">
      <div className="rounded-lg border border-border/50 bg-card/50 shadow-xs">
        <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2 text-[12px] text-muted-foreground">
          <span className="font-medium text-foreground">
            {detail?.author || item.author || translate('auto.components.GitHubItemDialog.773ff70035', 'unknown')}
          </span>
          <span>
            {translate('auto.components.GitHubItemDialog.8223320f8d', 'updated')}{' '}
            {item.updatedAt ? formatRelativeTime(item.updatedAt) : ''}
          </span>
        </div>
        <div className="whitespace-pre-wrap px-4 py-3 text-sm text-foreground">
          {error ? <p className="text-destructive">{error}</p> : null}
          {!detail && !error ? <LoaderCircle className="size-4 animate-spin" /> : null}
          {detail?.description ||
            (detail
              ? translate('auto.components.TaskPage.codehubNoDescription', 'No description')
              : '')}
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3 px-4">
        {commentError ? <p className="text-sm text-destructive">{commentError}</p> : null}
        {comments.map((comment) => (
          <div key={comment.id} className="rounded-lg border border-border/50 bg-card/40">
            <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2 text-[12px] text-muted-foreground">
              <span className="font-medium text-foreground">{comment.author ?? ''}</span>
              <span>{comment.createdAt ? formatRelativeTime(comment.createdAt) : ''}</span>
              <button
                type="button"
                className="ml-auto text-muted-foreground hover:text-foreground"
                aria-label={translate('auto.components.TaskPage.codehubDeleteComment', 'Delete comment')}
                onClick={() => {
                  if (!item.repoPath) {
                    return
                  }
                  void window.api.codehub
                    .deleteComment({
                      repoPath: item.repoPath,
                      repoId: item.repoId,
                      kind: item.type,
                      iid: item.iid,
                      commentId: comment.id
                    })
                    .then(() => setComments((rows) => rows.filter((row) => row.id !== comment.id)))
                    .catch((reason: unknown) => {
                      toast.error(reason instanceof Error ? reason.message : String(reason))
                    })
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <div className="whitespace-pre-wrap px-3 py-2 text-sm">{comment.body}</div>
          </div>
        ))}
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={translate('auto.components.TaskPage.codehubComment', 'Write a comment')}
          className="min-h-24 rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
        />
        <div className="flex justify-end">
          <Button size="sm" disabled={posting || draft.trim().length === 0} onClick={postComment}>
            {posting ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {translate('auto.components.TaskPage.codehubCommentSubmit', 'Comment')}
          </Button>
        </div>
        <TaskPageCodeHubActions item={actionItem} onChanged={reloadDetail} />
      </div>
    </div>
  )
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border/50 bg-background">
      {item.type === 'issue' ? (
        <>
          <div className="flex-none border-b border-border/60 bg-muted/30 px-6 py-2.5">
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCodehubDetailItem(null)}
                className="-ml-2 h-7 gap-1 px-2 text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="size-4" />
                {backLabel}
              </Button>
              {projectLabel ? (
                <>
                  <span className="text-border">·</span>
                  <span className="truncate font-medium text-foreground">{projectLabel}</span>
                </>
              ) : null}
              <span className="font-mono text-muted-foreground">#{item.iid}</span>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={translate('auto.components.GitHubItemDialog.c43fe79ee0', 'Copy GitHub link')}
                  onClick={() => {
                    void navigator.clipboard.writeText(detail?.url || item.url).then(() => {
                      setCopied(true)
                      window.setTimeout(() => setCopied(false), 1200)
                    })
                  }}
                >
                  {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={translate('auto.components.TaskPage.codehubOpen', 'Open in CodeHub')}
                  onClick={() => void window.api.shell.openUrl(detail?.url || item.url)}
                >
                  <ExternalLink className="size-4" />
                </Button>
              </div>
            </div>
          </div>
          <div className="flex-none border-b border-border/60 bg-card px-6 py-4">
            <div className="flex items-start gap-4">
              {editingTitle ? (
                <form
                  className="flex min-w-0 flex-1 items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    saveTitle()
                  }}
                >
                  <input
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    className="h-10 min-w-0 flex-1 rounded-md border border-border/60 bg-background px-3 text-lg"
                  />
                  <Button type="submit" size="sm" disabled={savingTitle || titleDraft.trim().length === 0}>
                    {savingTitle ? <LoaderCircle className="size-4 animate-spin" /> : null}
                    {translate('auto.components.TaskPage.codehubSaveTitle', 'Save')}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditingTitle(false)}>
                    {translate('auto.components.TaskPage.codehubCancelTitle', 'Cancel')}
                  </Button>
                </form>
              ) : (
                <h1 className="min-w-0 flex-1 text-[28px] font-medium leading-tight text-foreground">
                  <span className="break-words">{title}</span>
                  <span className="ml-2 font-light text-muted-foreground">#{item.iid}</span>
                  <button
                    type="button"
                    className="ml-2 inline-flex align-middle text-muted-foreground hover:text-foreground"
                    aria-label={translate('auto.components.TaskPage.codehubEditTitle', 'Edit title')}
                    onClick={() => {
                      setTitleDraft(title)
                      setEditingTitle(true)
                    }}
                  >
                    <Pencil className="size-4" />
                  </button>
                </h1>
              )}
              <Button type="button" size="sm" className="gap-1.5 whitespace-nowrap" onClick={() => handleUseCodeHubItem(item)}>
                {translate('auto.components.GitHubItemDialog.0ab4664a8b', 'Start workspace from issue')}
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium',
                  closed ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
                )}
              >
                {closed ? <CircleDashed className="size-3.5" /> : <CircleDot className="size-3.5" />}
                {closed
                  ? translate('auto.components.GitHubItemDialog.ab050dffec', 'Closed')
                  : translate('auto.components.GitHubItemDialog.dc1ca081a8', 'Open')}
              </span>
              <span className="font-semibold text-foreground">
                {detail?.author || item.author || translate('auto.components.GitHubItemDialog.773ff70035', 'unknown')}
              </span>
              <span>{translate('auto.components.GitHubItemDialog.55962099bc', 'opened this issue')}</span>
              {closed ? (
                <Button size="sm" variant="outline" disabled={stateBusy} onClick={() => setIssueState('open')}>
                  {translate('auto.components.TaskPage.codehubReopen', 'Reopen')}
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={stateBusy}
                    onClick={() => setIssueState('closed', 'completed')}
                  >
                    {translate('auto.components.TaskPage.codehubCloseCompleted', 'Close as completed')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={stateBusy}
                    onClick={() => setIssueState('closed', 'not_planned')}
                  >
                    {translate('auto.components.TaskPage.codehubCloseNotPlanned', 'Close as not planned')}
                  </Button>
                  <form
                    className="flex items-center gap-1"
                    onSubmit={(event) => {
                      event.preventDefault()
                      setIssueState('closed', 'duplicate')
                    }}
                  >
                    <input
                      value={duplicateOf}
                      onChange={(event) => setDuplicateOf(event.target.value)}
                      inputMode="numeric"
                      placeholder={translate('auto.components.TaskPage.codehubDuplicateOf', '#')}
                      aria-label={translate(
                        'auto.components.TaskPage.codehubDuplicateOf',
                        'Duplicate of issue number'
                      )}
                      className="h-8 w-16 rounded-md border border-border/60 bg-background px-2 text-xs"
                    />
                    <Button size="sm" type="submit" variant="outline" disabled={stateBusy || !duplicateOf.trim()}>
                      {translate('auto.components.TaskPage.codehubCloseDuplicate', 'Close as duplicate')}
                    </Button>
                  </form>
                </>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek bg-background">{conversation}</div>
        </>
      ) : (
        <>
          <div className="flex-none border-b border-border/60 bg-card/80 px-4 py-3 shadow-xs">
            <div className="flex items-start gap-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCodehubDetailItem(null)}
                className="-ml-1 mt-0.5 shrink-0 gap-1.5"
              >
                <ChevronLeft className="size-4" />
                {backLabel}
              </Button>
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground">
                <GitPullRequest className="size-4" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                      closed ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
                    )}
                  >
                    {detail?.state || item.state}
                  </span>
                  <span className="font-mono">#{item.iid}</span>
                  <span>{translate('auto.components.GitHubItemDialog.a2495e4784', 'Pull request')}</span>
                </div>
                <h2 className="text-[15px] font-semibold leading-snug text-foreground">{title}</h2>
                <div className="text-[11px] text-muted-foreground">
                  {detail?.author || item.author || translate('auto.components.GitHubItemDialog.773ff70035', 'unknown')}
                  {item.updatedAt
                    ? ` · ${translate('auto.components.GitHubItemDialog.8223320f8d', 'updated')} ${formatRelativeTime(item.updatedAt)}`
                    : ''}
                </div>
              </div>
              <Button type="button" size="sm" className="gap-1.5" onClick={() => handleUseCodeHubItem(item)}>
                {translate('auto.components.TaskPage.7d08e8be0f', 'Start')}
                <ArrowRight className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={translate('auto.components.TaskPage.codehubOpen', 'Open in CodeHub')}
                onClick={() => void window.api.shell.openUrl(detail?.url || item.url)}
              >
                <ExternalLink className="size-4" />
              </Button>
            </div>
          </div>
          <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
            <TabsList variant="line" className="mx-4 mt-2 justify-start gap-3 border-b border-border/60 bg-transparent">
              <TabsTrigger value="conversation" className="px-2">
                <MessageSquare className="size-3.5" />
                {translate('auto.components.GitHubItemDialog.e30a5470c9', 'Conversation')}
              </TabsTrigger>
              <TabsTrigger value="checks" className="px-2">
                <ListChecks className="size-3.5" />
                {translate('auto.components.GitHubItemDialog.4bd1f5b055', 'Checks')}
              </TabsTrigger>
            </TabsList>
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
              <TabsContent value="conversation" className="mt-0">
                {conversation}
              </TabsContent>
              <TabsContent value="checks" className="mt-0 px-6 py-4">
                <TaskPageCodeHubActions item={actionItem} onChanged={reloadDetail} />
              </TabsContent>
            </div>
          </Tabs>
        </>
      )}
    </div>
  )
}
