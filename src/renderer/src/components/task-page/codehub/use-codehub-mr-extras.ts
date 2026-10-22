import { useCallback, useEffect, useRef, useState } from 'react'
import { codehubApi } from '@/lib/codehub-api'
import type { CodeHubMrFileChange } from '../../../../../shared/codehub-mr-detail'
import type { PRCheckDetail } from '../../../../../shared/github/check-types'
import type { CodeHubTaskItem } from '../../../../../shared/codehub-tasks'

// MR 详情的检查项与文件变更。null = 还没读到,区分「没有」与「未加载」;
// tab 徽标与 Checks 空态靠它判断。
export function useCodeHubMrExtras(item: CodeHubTaskItem | null) {
  const [checks, setChecks] = useState<PRCheckDetail[] | null>(null)
  const [files, setFiles] = useState<CodeHubMrFileChange[] | null>(null)
  const [mrExtrasLoading, setMrExtrasLoading] = useState(false)
  const staleRef = useRef(false)

  const load = useCallback((): void => {
    if (!item?.repoPath || item.type !== 'mr') {
      return
    }
    const isStale = () => staleRef.current
    setMrExtrasLoading(true)
    const checksReq = codehubApi
      .mrChecks({ repoPath: item.repoPath, repoId: item.repoId, iid: item.iid })
      .then((rows) => {
        if (!isStale()) {
          setChecks(rows)
        }
      })
      .catch(() => {
        if (!isStale()) {
          setChecks([])
        }
      })
    const filesReq = codehubApi
      .mrChanges({ repoPath: item.repoPath, repoId: item.repoId, iid: item.iid })
      .then((rows) => {
        if (!isStale()) {
          setFiles(rows)
        }
      })
      .catch(() => {
        if (!isStale()) {
          setFiles([])
        }
      })
    void Promise.all([checksReq, filesReq]).finally(() => {
      if (!isStale()) {
        setMrExtrasLoading(false)
      }
    })
  }, [item])

  useEffect(() => {
    staleRef.current = false
    setChecks(null)
    setFiles(null)
    setMrExtrasLoading(false)
    load()
    return () => {
      staleRef.current = true
    }
  }, [load])

  // 用户主动刷新当前 item 时走这里;首次加载由上面的 effect 驱动。
  const reloadMrExtras = load

  return { checks, files, mrExtrasLoading, reloadMrExtras }
}
