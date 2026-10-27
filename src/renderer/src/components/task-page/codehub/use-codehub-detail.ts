import { codehubApi } from '@/lib/codehub-api'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { CodeHubComment, CodeHubTaskDetail } from '../../../../../shared/codehub-tasks'
import { useCodeHubMrExtras } from './use-codehub-mr-extras'
import type { TaskPageComposerActionsModel } from '../../use-task-page-composer-actions'

export function useCodeHubDetail(model: TaskPageComposerActionsModel) {
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
  const [editingLabels, setEditingLabels] = useState(false)
  const [labelDraft, setLabelDraft] = useState<string[]>([])
  const [savingLabels, setSavingLabels] = useState(false)
  const [stateBusy, setStateBusy] = useState(false)
  const { checks, files, mrExtrasLoading, reloadMrExtras } = useCodeHubMrExtras(item)
  // reloadDetail and the mount effect fetch the same pair; only the mount
  // race needs a stale guard, so it defaults to "never stale".
  const fetchDetailAndComments = (
    args: { repoPath: string; repoId?: string; kind: 'issue' | 'mr'; iid: number },
    isStale: () => boolean = () => false
  ): void => {
    void codehubApi
      .viewTask(args)
      .then((next) => {
        if (!isStale()) {
          setDetail(next)
          setError(null)
        }
      })
      .catch((reason: unknown) => {
        if (!isStale()) {
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      })
    void codehubApi
      .listComments(args)
      .then((rows) => {
        if (!isStale()) {
          setComments(rows)
          setCommentError(null)
        }
      })
      .catch((reason: unknown) => {
        if (!isStale()) {
          setComments([])
          setCommentError(reason instanceof Error ? reason.message : String(reason))
        }
      })
  }
  const reloadDetail = (): void => {
    if (!item?.repoPath) {
      return
    }
    fetchDetailAndComments({
      repoPath: item.repoPath,
      repoId: item.repoId,
      kind: item.type,
      iid: item.iid
    })
    setCodehubRefreshNonce((nonce) => nonce + 1)
    if (item.type === 'mr') {
      reloadMrExtras()
    }
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
    setEditingLabels(false)
    setTab('conversation')
    fetchDetailAndComments(
      { repoPath: item.repoPath, repoId: item.repoId, kind: item.type, iid: item.iid },
      () => stale
    )
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
  const actionState = (
    visibleState === 'merged' ? 'merged' : visibleState === 'closed' ? 'closed' : 'opened'
  ) as 'opened' | 'closed' | 'merged'
  const actionItem = { ...item, title, state: actionState }
  const backLabel =
    item.type === 'mr'
      ? translate('auto.components.TaskPage.137e2a8a01', 'PRs')
      : translate('auto.components.TaskPage.dfc0c79bd8', 'Issues')
  const projectLabel = item.project ?? ''
  // postComment and postReply share the create→reload chain; only what
  // happens after a successful reload differs (clearing the draft vs the
  // boolean result).
  const submitComment = (extra: { body: string; discussionId?: string }): Promise<boolean> => {
    if (!item.repoPath) {
      return Promise.resolve(false)
    }
    return codehubApi
      .createComment({
        repoPath: item.repoPath,
        repoId: item.repoId,
        kind: item.type,
        iid: item.iid,
        ...extra
      })
      .then(() =>
        codehubApi.listComments({
          repoPath: item.repoPath!,
          repoId: item.repoId,
          kind: item.type,
          iid: item.iid
        })
      )
      .then((rows) => {
        setComments(rows)
        return true
      })
      .catch((reason: unknown) => {
        toast.error(reason instanceof Error ? reason.message : String(reason))
        return false
      })
  }
  const postComment = (): void => {
    const body = draft.trim()
    if (!body || posting) {
      return
    }
    setPosting(true)
    void submitComment({ body })
      .then((ok) => {
        if (ok) {
          setDraft('')
        }
      })
      .finally(() => setPosting(false))
  }
  const postReply = (discussionId: string, body: string): Promise<boolean> =>
    !body ? Promise.resolve(false) : submitComment({ body, discussionId })
  const saveTitle = (): void => {
    const nextTitle = titleDraft.trim()
    if (!item.repoPath || !nextTitle || savingTitle || nextTitle === title) {
      setEditingTitle(false)
      return
    }
    setSavingTitle(true)
    void codehubApi
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
  const saveLabels = (): void => {
    if (!item.repoPath || savingLabels) {
      return
    }
    const current = detail?.labels?.length ? detail.labels : (item.labels ?? [])
    // `--labels` is replace-semantics, so the draft is the resulting full
    // set; trimming and de-duplicating here keeps the sent CSV canonical.
    const nextLabels = [...new Set(labelDraft.map((label) => label.trim()).filter(Boolean))]
    if (
      nextLabels.length === current.length &&
      [...nextLabels].sort().join('\0') === [...current].sort().join('\0')
    ) {
      setEditingLabels(false)
      return
    }
    setSavingLabels(true)
    void codehubApi
      .updateIssueLabels({
        repoPath: item.repoPath,
        repoId: item.repoId,
        iid: item.iid,
        labels: nextLabels
      })
      .then(() => {
        setEditingLabels(false)
        toast.success(translate('auto.components.TaskPage.codehubLabelsSaved', 'Labels updated'))
        reloadDetail()
      })
      .catch((reason: unknown) => {
        toast.error(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => setSavingLabels(false))
  }
  const setIssueState = (
    state: 'open' | 'closed',
    stateReason?: 'completed' | 'not_planned' | 'duplicate',
    duplicateNumber?: number
  ): void => {
    if (!item.repoPath || stateBusy) {
      return
    }
    if (stateReason === 'duplicate' && !Number.isInteger(duplicateNumber)) {
      return
    }
    setStateBusy(true)
    void codehubApi
      .setIssueState({
        repoPath: item.repoPath,
        repoId: item.repoId,
        iid: item.iid,
        state,
        stateReason,
        duplicateOf: stateReason === 'duplicate' ? (duplicateNumber ?? null) : null
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
  return {
    item,
    detail,
    comments,
    setComments,
    error,
    draft,
    setDraft,
    posting,
    copied,
    setCopied,
    tab,
    setTab,
    commentError,
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
    reloadDetail,
    checks,
    files,
    mrExtrasLoading,
    reloadMrExtras,
    title,
    closed,
    actionItem,
    backLabel,
    projectLabel,
    postComment,
    postReply,
    saveTitle,
    setIssueState,
    setCodehubDetailItem,
    handleUseCodeHubItem
  }
}
export type CodeHubDetailState = NonNullable<ReturnType<typeof useCodeHubDetail>>
