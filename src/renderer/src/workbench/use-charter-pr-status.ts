import { useEffect, useState } from 'react'
import type { Repo } from '../../../shared/repo-types'
import type { CharterStatus } from '../../../shared/workbench/charter'
import { readCharterPrStatus } from './charter-port'

/**
 * 总览的名片 PR 状态:主检出没有名片才查(省 gh/codehub 调用);
 */
export function useCharterPrStatus(
  activeRepo: Repo | undefined,
  hasCharter: boolean,
  scopeKey: string
): {
  charterStatus: CharterStatus | null
  /** Drops the cached PR status so the next effect pass re-queries the provider. */
  refreshCharterStatus: () => void
} {
  const [charterStatusState, setCharterStatusState] = useState<{
    key: string
    value: CharterStatus
  } | null>(null)
  const charterStatus = charterStatusState?.key === scopeKey ? charterStatusState.value : null
  const [statusRetry, setStatusRetry] = useState(0)

  useEffect(() => {
    if (!activeRepo || hasCharter) {
      setCharterStatusState(null)
      return
    }
    let cancelled = false
    void readCharterPrStatus(activeRepo).then((status) => {
      if (!cancelled) {
        setCharterStatusState({ key: scopeKey, value: status })
      }
    })
    return () => {
      cancelled = true
    }
  }, [activeRepo, hasCharter, scopeKey, statusRetry])

  const refreshCharterStatus = () => {
    setCharterStatusState(null)
    setStatusRetry((value) => value + 1)
  }

  return { charterStatus, refreshCharterStatus }
}
