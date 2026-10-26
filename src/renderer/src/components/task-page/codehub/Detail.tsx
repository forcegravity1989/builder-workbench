import { useCodeHubDetail } from './use-codehub-detail'
import { attachedCodeHubDetailWorkspace } from '@/workbench/scoped-task-workspace'
import { CodeHubChecksTab } from './ChecksTab'
import { CodeHubConversation } from './Conversation'
import { CodeHubFilesTab } from './FilesTab'
import type { TaskPageComposerActionsModel } from '../../use-task-page-composer-actions'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { CodeHubIssueProperties } from './IssueProperties'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowRight,
  Check,
  ChevronLeft,
  CircleDashed,
  CircleDot,
  Copy,
  ExternalLink,
  FileText,
  GitPullRequest,
  ListChecks,
  LoaderCircle,
  MessageSquare,
  Pencil
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getWorktreeAttachmentLabel } from '@/lib/worktree-attachment-label'
import { TaskPageGitHubWorkItemStateBadge } from '@/components/task-page-github-work-item-status-badge'
import { formatRelativeTime } from '../../task-page-source-context'
import type { Worktree } from '../../../../../shared/worktree/types'

const NO_WORKTREES: readonly Worktree[] = []

function CopyLinkButton({
  url,
  copied,
  setCopied
}: {
  url: string
  copied: boolean
  setCopied: (copied: boolean) => void
}): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={translate('auto.components.GitHubItemDialog.c43fe79ee0', 'Copy GitHub link')}
      onClick={() => {
        void navigator.clipboard.writeText(url).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1200)
        })
      }}
    >
      {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
    </Button>
  )
}
export function TaskPageCodeHubDetail({
  model
}: {
  model: TaskPageComposerActionsModel
}): React.JSX.Element | null {
  const repoId = model.codehubDetailItem?.repoId ?? null
  const repoWorktrees = useAppStore((state) =>
    repoId ? (state.worktreesByRepo[repoId] ?? NO_WORKTREES) : NO_WORKTREES
  )
  // G2（P4 详情往返携带范围）：范围态归属呈现与任务屏行/板面箭头同一解析核。
  const workbenchTaskScope = useAppStore((s) => s.taskPageData.workbenchTaskScope ?? null)
  const repo = useAppStore((s) => (repoId ? (s.repos.find((r) => r.id === repoId) ?? null) : null))
  const detailState = useCodeHubDetail(model)
  if (!detailState) {
    return null
  }
  const {
    item,
    detail,
    copied,
    setCopied,
    tab,
    setTab,
    editingTitle,
    setEditingTitle,
    titleDraft,
    setTitleDraft,
    savingTitle,
    editingLabels,
    setEditingLabels,
    labelDraft,
    setLabelDraft,
    savingLabels,
    saveLabels,
    stateBusy,
    title,
    closed,
    actionItem,
    backLabel,
    projectLabel,
    saveTitle,
    setIssueState,
    setCodehubDetailItem,
    handleUseCodeHubItem
  } = detailState
  const attached = attachedCodeHubDetailWorkspace({
    scope: workbenchTaskScope,
    worktrees: repoWorktrees,
    repo,
    item
  })
  const workspaceLabel = attached ? getWorktreeAttachmentLabel(attached) : null
  const sourceBranch = detail?.sourceBranch ?? item.sourceBranch
  const targetBranch = detail?.targetBranch ?? item.targetBranch
  const branchLabel =
    sourceBranch && targetBranch
      ? `${sourceBranch} → ${targetBranch}`
      : (sourceBranch ?? targetBranch)
  const conversation = <CodeHubConversation state={detailState} />
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
                <CopyLinkButton
                  url={detail?.url || item.url}
                  copied={copied}
                  setCopied={setCopied}
                />
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
                  <Button
                    type="submit"
                    size="sm"
                    disabled={savingTitle || titleDraft.trim().length === 0}
                  >
                    {savingTitle ? <LoaderCircle className="size-4 animate-spin" /> : null}
                    {translate('auto.components.TaskPage.codehubSaveTitle', 'Save')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingTitle(false)}
                  >
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
                    aria-label={translate(
                      'auto.components.TaskPage.codehubEditTitle',
                      'Edit title'
                    )}
                    onClick={() => {
                      setTitleDraft(title)
                      setEditingTitle(true)
                    }}
                  >
                    <Pencil className="size-4" />
                  </button>
                </h1>
              )}
              <Button
                type="button"
                size="sm"
                className="gap-1.5 whitespace-nowrap"
                onClick={() => handleUseCodeHubItem(item)}
              >
                {translate(
                  'auto.components.GitHubItemDialog.0ab4664a8b',
                  'Start workspace from issue'
                )}
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
                {closed ? (
                  <CircleDashed className="size-3.5" />
                ) : (
                  <CircleDot className="size-3.5" />
                )}
                {closed
                  ? translate('auto.components.GitHubItemDialog.ab050dffec', 'Closed')
                  : translate('auto.components.GitHubItemDialog.dc1ca081a8', 'Open')}
              </span>
              <span className="font-semibold text-foreground">
                {detail?.author ||
                  item.author ||
                  translate('auto.components.GitHubItemDialog.773ff70035', 'unknown')}
              </span>
              <span>
                {translate('auto.components.GitHubItemDialog.55962099bc', 'opened this issue')}
              </span>
              {item.updatedAt ? (
                <span className="text-muted-foreground/80">
                  {translate('auto.components.GitHubItemDialog.10ef1afb8e', '· updated')}{' '}
                  {formatRelativeTime(item.updatedAt)}
                </span>
              ) : null}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek bg-background">
            <CodeHubIssueProperties
              closed={closed}
              stateBusy={stateBusy}
              setIssueState={setIssueState}
              assignees={detail?.assignees?.length ? detail.assignees : item.assignees}
              labels={detail?.labels?.length ? detail.labels : (item.labels ?? [])}
              editingLabels={editingLabels}
              setEditingLabels={setEditingLabels}
              labelDraft={labelDraft}
              setLabelDraft={setLabelDraft}
              savingLabels={savingLabels}
              saveLabels={saveLabels}
              workspaceLabel={workspaceLabel}
            />
            {conversation}
          </div>
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
                  <TaskPageGitHubWorkItemStateBadge
                    item={{
                      type: 'pr',
                      state: actionItem.state === 'opened' ? 'open' : actionItem.state
                    }}
                  />
                  <span className="font-mono">#{item.iid}</span>
                  <span>
                    {translate('auto.components.GitHubItemDialog.a2495e4784', 'Pull request')}
                  </span>
                </div>
                <h2 className="text-[15px] font-semibold leading-snug text-foreground">{title}</h2>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <span>
                    {detail?.author ||
                      item.author ||
                      translate('auto.components.GitHubItemDialog.773ff70035', 'unknown')}
                  </span>
                  {item.updatedAt ? (
                    <span>
                      {translate('auto.components.GitHubItemDialog.8223320f8d', 'updated')}{' '}
                      {formatRelativeTime(item.updatedAt)}
                    </span>
                  ) : null}
                  {branchLabel ? (
                    <span className="max-w-full truncate rounded-md border border-border/50 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {branchLabel}
                    </span>
                  ) : null}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                className="gap-1.5 whitespace-nowrap"
                onClick={() => handleUseCodeHubItem(item)}
                aria-label={translate(
                  'auto.components.GitHubItemDialog.0caac1a18f',
                  'Start workspace from PR'
                )}
              >
                {translate(
                  'auto.components.GitHubItemDialog.0caac1a18f',
                  'Start workspace from PR'
                )}
                <ArrowRight className="size-3.5" />
              </Button>
              <CopyLinkButton url={detail?.url || item.url} copied={copied} setCopied={setCopied} />
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
            <TabsList
              variant="line"
              className="mx-4 mt-2 justify-start gap-3 border-b border-border/60 bg-transparent"
            >
              <TabsTrigger value="conversation" className="px-2">
                <MessageSquare className="size-3.5" />
                {translate('auto.components.GitHubItemDialog.e30a5470c9', 'Conversation')}
              </TabsTrigger>
              <TabsTrigger value="checks" className="px-2">
                <ListChecks className="size-3.5" />
                {translate('auto.components.GitHubItemDialog.4bd1f5b055', 'Checks')}
                {detailState.checks && detailState.checks.length > 0 && (
                  <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
                    {detailState.checks.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="files" className="px-2">
                <FileText className="size-3.5" />
                {translate('auto.components.PullRequestPage.4d18310d55', 'Files changed')}
                {detailState.files && detailState.files.length > 0 && (
                  <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
                    {detailState.files.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
              <TabsContent value="conversation" className="mt-0">
                {conversation}
              </TabsContent>
              <TabsContent value="checks" className="mt-0">
                <CodeHubChecksTab state={detailState} />
              </TabsContent>
              <TabsContent value="files" className="mt-0 h-full min-h-0 overflow-hidden">
                <CodeHubFilesTab state={detailState} />
              </TabsContent>
            </div>
          </Tabs>
        </>
      )}
    </div>
  )
}
