import { codehubApi } from '@/lib/codehub-api'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { findCodeHubTaskRepo } from '@/lib/codehub-task-repo'
import type {
  CodeHubComment,
  CodeHubTaskDetail,
  CodeHubTaskItem
} from '../../../../../shared/codehub-tasks'
import type { Repo } from '../../../../../shared/repo-types'
import {
  codehubDetailCache,
  ensureCodehubDetailFresh,
  getCodehubDetailCacheKey,
  invalidateCodehubDetailCache,
  subscribeCodehubDetailCache,
  touchCodehubDetailCache,
  type CodeHubDetailReadArgs
} from './codehub-detail-cache'
import { useCodeHubMrExtras } from './use-codehub-mr-extras'
import type { TaskPageComposerActionsModel } from '../../use-task-page-composer-actions'

/** Resolves the single repo a CodeHub item belongs to, mirroring the row-level
 * owner resolution: the active task-page selection first, then the full store.
 * A cross-host duplicate id resolves to the host the item's executionHostId
 * pins, so reads and mutations never route to another host's CLI. */
// 详情读取的宿主限定参数从 item 推导；每个读取点用同一构造器，mount 效果、
// 手动 reload 与详情钩子不会各写一套导致 host 段漂移。repoPath 单独立参，让
// 调用点的守卫（!item?.repoPath）能把窄化结果直接传进来。
function codeHubDetailReadArgs(item: CodeHubTaskItem, repoPath: string): CodeHubDetailReadArgs {
  return {
    repoPath,
    repoId: item.repoId,
    kind: item.type,
    iid: item.iid,
    executionHostId: item.executionHostId
  }
}

function resolveCodeHubDetailOwner(
  model: TaskPageComposerActionsModel,
  item: CodeHubTaskItem
): Repo | null {
  const bySelection = findCodeHubTaskRepo(model.selectedRepos, item)
  if (bySelection) {
    return bySelection
  }
  return findCodeHubTaskRepo(useAppStore.getState().repos, item)
}

/**
 * The CodeHub detail lives in taskPageData (not local state) so external opens —
 * deep links and other screens — replay through the shared nav
 * history like every other provider's detail entry.
 */
export function useCodeHubDetail(model: TaskPageComposerActionsModel) {
  const { codehubDetailItem, setCodehubDetailItem, handleUseCodeHubItem, setCodehubRefreshNonce } =
    model
  const item = codehubDetailItem
  const owner = item ? resolveCodeHubDetailOwner(model, item) : null
  const key = item
    ? getCodehubDetailCacheKey({
        repoId: item.repoId,
        kind: item.type,
        iid: item.iid,
        executionHostId: item.executionHostId
      })
    : ''
  // Why: cache writes replace entry identity (delete+set), so Map.get is a stable snapshot for useSyncExternalStore.
  const entry = useSyncExternalStore(
    subscribeCodehubDetailCache,
    useCallback(() => (key ? codehubDetailCache.get(key) : undefined), [key])
  )
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState('conversation')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [savingTitle, setSavingTitle] = useState(false)
  const [editingLabels, setEditingLabels] = useState(false)
  const [labelDraft, setLabelDraft] = useState<string[]>([])
  const [savingLabels, setSavingLabels] = useState(false)
  const [stateBusy, setStateBusy] = useState(false)
  const { checks, files, mrExtrasLoading, reloadMrExtras } = useCodeHubMrExtras(item, owner)
  // Data lanes read from the shared SWR cache: a reopen paints cached data
  // instantly while ensureCodehubDetailFresh reconciles in the background.
  const detail: CodeHubTaskDetail | null = entry?.detail ?? null
  const comments: CodeHubComment[] = entry?.comments ?? []
  // Stale-on-error: surface an error only when its lane has nothing to show.
  const error = entry?.detailError && !entry.detail ? entry.detailError : null
  const commentError = entry?.commentError && !entry.comments ? entry.commentError : null

  // UI state resets on item switch; data lanes come from the cache instead of
  // being cleared, so a cached reopen keeps painting instead of flashing empty.
  useEffect(() => {
    if (!item?.repoPath) {
      return
    }
    setEditingTitle(false)
    setEditingLabels(false)
    setTab('conversation')
    void ensureCodehubDetailFresh(codeHubDetailReadArgs(item, item.repoPath), owner)
  }, [item, owner])

  const reloadDetail = useCallback((): void => {
    if (!item?.repoPath) {
      return
    }
    invalidateCodehubDetailCache(key)
    void ensureCodehubDetailFresh(codeHubDetailReadArgs(item, item.repoPath), owner)
    setCodehubRefreshNonce((nonce) => nonce + 1)
  }, [item, key, owner, setCodehubRefreshNonce])

  // Comment threads and the files tab write fetched rows back through this
  // instead of local state (same callers as before the cache existed).
  const setComments = useCallback(
    (rows: CodeHubComment[]): void => {
      if (!key) {
        return
      }
      const cached = codehubDetailCache.get(key)
      if (cached) {
        touchCodehubDetailCache(key, { ...cached, comments: rows, commentError: undefined })
      }
    },
    [key]
  )

  // postComment and postReply share the create→reload chain; only what
  // happens after a successful reload differs (clearing the draft vs the
  // boolean result).
  const submitComment = async (extra: { body: string; discussionId?: string }): Promise<boolean> => {
    if (!item?.repoPath || (item.executionHostId && !owner)) {
      return false
    }
    try {
      await codehubApi.createComment(
        { ...codeHubDetailReadArgs(item, item.repoPath), ...extra },
        owner ?? undefined
      )
      reloadDetail()
      return true
    } catch (reason: unknown) {
      toast.error(reason instanceof Error ? reason.message : String(reason))
      return false
    }
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
  const saveTitle = async (): Promise<void> => {
    const nextTitle = titleDraft.trim()
    if (
      !item?.repoPath ||
      (item.executionHostId && !owner) ||
      !nextTitle ||
      savingTitle ||
      nextTitle === (detail?.title || item.title)
    ) {
      setEditingTitle(false)
      return
    }
    setSavingTitle(true)
    try {
      await codehubApi.updateIssueTitle(
        {
          repoPath: item.repoPath,
          repoId: item.repoId,
          iid: item.iid,
          title: nextTitle
        },
        owner ?? undefined
      )
      setEditingTitle(false)
      toast.success(translate('auto.components.TaskPage.codehubTitleSaved', 'Title updated'))
      reloadDetail()
    } catch (reason: unknown) {
      toast.error(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSavingTitle(false)
    }
  }
  const saveLabels = async (): Promise<void> => {
    if (!item?.repoPath || (item.executionHostId && !owner) || savingLabels) {
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
    try {
      await codehubApi.updateIssueLabels(
        {
          repoPath: item.repoPath,
          repoId: item.repoId,
          iid: item.iid,
          labels: nextLabels
        },
        owner ?? undefined
      )
      setEditingLabels(false)
      toast.success(translate('auto.components.TaskPage.codehubLabelsSaved', 'Labels updated'))
      reloadDetail()
    } catch (reason: unknown) {
      toast.error(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSavingLabels(false)
    }
  }
  const setIssueState = async (
    state: 'open' | 'closed',
    stateReason?: 'completed' | 'not_planned' | 'duplicate',
    duplicateNumber?: number
  ): Promise<void> => {
    if (!item?.repoPath || (item.executionHostId && !owner) || stateBusy) {
      return
    }
    if (stateReason === 'duplicate' && !Number.isInteger(duplicateNumber)) {
      return
    }
    setStateBusy(true)
    try {
      await codehubApi.setIssueState(
        {
          repoPath: item.repoPath,
          repoId: item.repoId,
          iid: item.iid,
          state,
          stateReason,
          duplicateOf: stateReason === 'duplicate' ? (duplicateNumber ?? null) : null
        },
        owner ?? undefined
      )
      toast.success(
        state === 'open'
          ? translate('auto.components.TaskPage.codehubIssueReopened', 'Issue reopened')
          : translate('auto.components.TaskPage.codehubIssueClosed', 'Issue closed')
      )
      reloadDetail()
    } catch (reason: unknown) {
      toast.error(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setStateBusy(false)
    }
  }
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
  return {
    item,
    owner,
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
