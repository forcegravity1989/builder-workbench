import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Repo } from '../../../shared/repo-types'
import type { CharterStatus } from '../../../shared/workbench/charter'
import { readCharterPrStatus } from './charter-port'
import { readProjectCharter, type ProjectCharter } from './project-charter'

/**
 * 总览的名片 PR 状态:主检出没有名片才查(省 gh/codehub 调用);
 * 「更新代码」= 主检出快进(spec 规则 2,main pull_ff 对等)。
 */
export function useCharterPrStatus(
  activeRepo: Repo | undefined,
  hasCharter: boolean,
  scopeKey: string,
  onCharterReloaded: (charter: ProjectCharter | null) => void
): {
  charterStatus: CharterStatus | null
  updatingMain: boolean
  updateMainCheckout: () => Promise<void>
} {
  const [charterStatusState, setCharterStatusState] = useState<{
    key: string
    value: CharterStatus
  } | null>(null)
  const charterStatus = charterStatusState?.key === scopeKey ? charterStatusState.value : null
  const [updatingMain, setUpdatingMain] = useState(false)

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
  }, [activeRepo, hasCharter, scopeKey])

  const updateMainCheckout = async (): Promise<void> => {
    if (!activeRepo || updatingMain) {
      return
    }
    setUpdatingMain(true)
    try {
      await window.api.git.fastForward({
        worktreePath: activeRepo.path,
        ...(activeRepo.connectionId ? { connectionId: activeRepo.connectionId } : {})
      })
      const r = await readProjectCharter(activeRepo.path)
      onCharterReloaded(r.charter)
      setCharterStatusState(null)
      toast.success('主检出已拉到最新')
    } catch (e) {
      toast.error(`没拉动：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setUpdatingMain(false)
    }
  }

  return { charterStatus, updatingMain, updateMainCheckout }
}
