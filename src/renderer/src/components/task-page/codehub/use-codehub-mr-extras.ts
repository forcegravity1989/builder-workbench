import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { CodeHubTaskItem } from '../../../../../shared/codehub-tasks'
import {
  codehubDetailCache,
  ensureCodehubDetailFresh,
  getCodehubDetailCacheKey,
  refreshCodehubMrExtras,
  subscribeCodehubDetailCache
} from './codehub-detail-cache'

// MR 详情的检查项与文件变更。null = 还没读到,区分「没有」与「未加载」;
// tab 徽标与 Checks 空态靠它判断。数据住共享 SWR 缓存,与详情主体同条目,
// 由 ensureCodehubDetailFresh 的整批读取一并拉取。
export function useCodeHubMrExtras(item: CodeHubTaskItem | null) {
  const key =
    item && item.type === 'mr'
      ? getCodehubDetailCacheKey({ repoId: item.repoId, kind: item.type, iid: item.iid })
      : ''
  const entry = useSyncExternalStore(
    subscribeCodehubDetailCache,
    useCallback(() => (key ? codehubDetailCache.get(key) : undefined), [key])
  )
  useEffect(() => {
    if (!item?.repoPath || item.type !== 'mr') {
      return
    }
    // Idempotent: the detail hook's mount effect already ensures this read; the
    // per-key pending promise dedupes when both fire.
    void ensureCodehubDetailFresh({
      repoPath: item.repoPath,
      repoId: item.repoId,
      kind: item.type,
      iid: item.iid
    })
  }, [item])
  const checks = key ? (entry?.checks ?? null) : null
  const files = key ? (entry?.files ?? null) : null
  const mrExtrasLoading = Boolean(key && entry?.pending)
  const reloadMrExtras = useCallback((): void => {
    if (!item?.repoPath || item.type !== 'mr') {
      return
    }
    void refreshCodehubMrExtras({
      repoPath: item.repoPath,
      repoId: item.repoId,
      kind: item.type,
      iid: item.iid
    })
  }, [item])
  return { checks, files, mrExtrasLoading, reloadMrExtras }
}
