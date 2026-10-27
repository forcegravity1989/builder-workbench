import { codehubApi } from '@/lib/codehub-api'
import type { CodeHubMrFileChange } from '../../../../../shared/codehub-mr-detail'
import type { CodeHubComment, CodeHubTaskDetail } from '../../../../../shared/codehub-tasks'
import type { PRCheckDetail } from '../../../../../shared/github/check-types'

/**
 * SWR cache for the CodeHub detail, modeled on
 * pull-request-page/cache/work-item-details.ts: reopening a detail paints the
 * cached lanes instantly while a background refetch reconciles, and concurrent
 * opens share one in-flight read. One entry carries the detail's four read
 * lanes (detail / comments / mr checks / mr files) keyed by repoId+kind+iid.
 *
 * Honest boundary: CodeHub mutations emit no cross-window invalidation events
 * (GitHub has gh:workItemMutated), so invalidation is same-window only — the
 * same correctness envelope as the previous per-mount refetch.
 */
export const CODEHUB_DETAIL_CACHE_MAX = 50
export const CODEHUB_DETAIL_FRESH_MS = 30_000

export type CodeHubDetailCacheEntry = {
  detail: CodeHubTaskDetail | null
  comments: CodeHubComment[] | null
  checks: PRCheckDetail[] | null
  files: CodeHubMrFileChange[] | null
  detailError?: string
  commentError?: string
  /**
   * Time of the last full read of the detail+comments lanes. 0 means partial
   * data (archive-jump prefill) that still triggers a full read on open.
   * Advances only when both main lanes succeed — a failed read stays
   * retryable (stale-on-error, same rule as the GitHub cache).
   */
  fetchedAt: number
  pending?: Promise<void>
}

export type CodeHubDetailKeyArgs = {
  // Optional to match CodeHubTaskItem/API nullish; the key normalizes it to ''.
  repoId: string | undefined
  kind: 'issue' | 'mr'
  iid: number
}
export type CodeHubDetailReadArgs = CodeHubDetailKeyArgs & { repoPath: string }

export const codehubDetailCache = new Map<string, CodeHubDetailCacheEntry>()

// Why: useSyncExternalStore snapshot stability relies on every cache write replacing the entry object identity (delete+set).
const codehubDetailCacheListeners = new Set<() => void>()

export function subscribeCodehubDetailCache(listener: () => void): () => void {
  codehubDetailCacheListeners.add(listener)
  return () => {
    codehubDetailCacheListeners.delete(listener)
  }
}

function notifyCodehubDetailCache(): void {
  for (const listener of codehubDetailCacheListeners) {
    listener()
  }
}

export function getCodehubDetailCacheKey(args: CodeHubDetailKeyArgs): string {
  // Why: `\0` separator avoids collisions between key fields that may contain `:` or `/`.
  return [args.repoId ?? '', args.kind, args.iid].join('\0')
}

export function touchCodehubDetailCache(key: string, entry: CodeHubDetailCacheEntry): void {
  // Why: re-insert moves the key to MRU; Map insertion order keeps the oldest key first when evicting.
  codehubDetailCache.delete(key)
  codehubDetailCache.set(key, entry)
  while (codehubDetailCache.size > CODEHUB_DETAIL_CACHE_MAX) {
    const oldest = codehubDetailCache.keys().next().value
    if (oldest === undefined) {
      break
    }
    codehubDetailCache.delete(oldest)
  }
  notifyCodehubDetailCache()
}

export function invalidateCodehubDetailCache(key: string): void {
  if (codehubDetailCache.delete(key)) {
    notifyCodehubDetailCache()
  }
}

function errorText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

/**
 * Ensures the entry holds fresh data, deduping concurrent full reads per key.
 * A fresh entry resolves immediately; a partial prefill (fetchedAt=0) still
 * triggers the full read while its detail lane keeps painting.
 */
export function ensureCodehubDetailFresh(args: CodeHubDetailReadArgs): Promise<void> {
  const key = getCodehubDetailCacheKey(args)
  const cached = codehubDetailCache.get(key)
  if (cached?.fetchedAt && Date.now() - cached.fetchedAt <= CODEHUB_DETAIL_FRESH_MS) {
    return Promise.resolve()
  }
  if (cached?.pending) {
    return cached.pending
  }
  // Why: `.then` closure (not an async IIFE) so the write-back guard can compare
  // against `read` itself — an immediately-invoked body trips TS2454.
  const read: Promise<void> = Promise.allSettled([
    codehubApi.viewTask(args),
    codehubApi.listComments(args),
    args.kind === 'mr' ? codehubApi.mrChecks(args) : Promise.resolve(null),
    args.kind === 'mr' ? codehubApi.mrChanges(args) : Promise.resolve(null)
  ]).then(([detailRes, commentsRes, checksRes, filesRes]) => {
    const current = codehubDetailCache.get(key)
    // Why: an invalidation (post-mutation) dropped/replaced this entry mid-flight; don't resurrect stale data.
    if (!current || current.pending !== read) {
      return
    }
    touchCodehubDetailCache(key, {
      detail: detailRes.status === 'fulfilled' ? detailRes.value : (current.detail ?? null),
      comments: commentsRes.status === 'fulfilled' ? commentsRes.value : (current.comments ?? null),
      checks: checksRes.status === 'fulfilled' ? checksRes.value : [],
      files: filesRes.status === 'fulfilled' ? filesRes.value : [],
      detailError: detailRes.status === 'rejected' ? errorText(detailRes.reason) : undefined,
      commentError: commentsRes.status === 'rejected' ? errorText(commentsRes.reason) : undefined,
      fetchedAt:
        detailRes.status === 'fulfilled' && commentsRes.status === 'fulfilled'
          ? Date.now()
          : current.fetchedAt
    })
  })
  touchCodehubDetailCache(key, {
    ...(cached ?? { detail: null, comments: null, checks: null, files: null }),
    fetchedAt: cached?.fetchedAt ?? 0,
    pending: read
  })
  return read
}

/**
 * Refreshes only the mr checks/files lanes (Checks/Files tab refresh buttons);
 * the detail/comments lanes and freshness stay untouched.
 */
export function refreshCodehubMrExtras(args: CodeHubDetailReadArgs): Promise<void> {
  const key = getCodehubDetailCacheKey(args)
  const read: Promise<void> = Promise.allSettled([
    codehubApi.mrChecks(args),
    codehubApi.mrChanges(args)
  ]).then(([checksRes, filesRes]) => {
    const current = codehubDetailCache.get(key)
    if (!current || current.pending !== read) {
      return
    }
    touchCodehubDetailCache(key, {
      ...current,
      checks: checksRes.status === 'fulfilled' ? checksRes.value : [],
      files: filesRes.status === 'fulfilled' ? filesRes.value : [],
      pending: undefined
    })
  })
  const cached = codehubDetailCache.get(key)
  touchCodehubDetailCache(key, {
    ...(cached ?? { detail: null, comments: null, checks: null, files: null }),
    fetchedAt: cached?.fetchedAt ?? 0,
    pending: read
  })
  return read
}

/**
 * Paints the archive jump's pre-fetch immediately (fetchedAt=0), so the detail
 * header shows without re-running `viewTask`; the open still triggers one full
 * read for the remaining lanes. A completed full read is fresher than the
 * jump-time snapshot and is never regressed.
 */
export function prefillCodehubDetailCache(
  args: CodeHubDetailKeyArgs,
  detail: CodeHubTaskDetail
): void {
  const key = getCodehubDetailCacheKey(args)
  const cached = codehubDetailCache.get(key)
  if (cached?.fetchedAt) {
    return
  }
  touchCodehubDetailCache(key, {
    comments: cached?.comments ?? null,
    checks: cached?.checks ?? null,
    files: cached?.files ?? null,
    detail,
    fetchedAt: 0
  })
}
