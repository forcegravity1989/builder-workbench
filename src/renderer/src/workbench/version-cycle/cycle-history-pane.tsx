import { useCallback, useState } from 'react'
import AiVaultPanel from '@/components/right-sidebar/AiVaultPanel'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import type { CycleScope } from './ports'

/**
 * Fixed-tree session history (native AiVault embedding), collapsed by default so
 * the chat column owns the screen; the collapse choice is remembered per workflow.
 */
export function CycleHistoryPane({
  scope,
  workflow,
  onOpenSession
}: {
  scope: CycleScope
  workflow: string
  onOpenSession: (item: AiVaultSession) => void
}) {
  const storeKey = `bw:cycle:history-open:${workflow}`
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(storeKey) === '1'
    } catch {
      return false
    }
  })
  const toggle = useCallback(() => {
    setOpen((value) => {
      const next = !value
      try {
        localStorage.setItem(storeKey, next ? '1' : '0')
      } catch {
        /* Collapse preference is best-effort. */
      }
      return next
    })
  }, [storeKey])
  return (
    <div className={`vc-history${open ? '' : ' is-collapsed'}`}>
      <button type="button" className="vc-history-toggle" aria-expanded={open} onClick={toggle}>
        {open ? '▾' : '▸'} 智能体会话历史（仅本固定树下的会话）
      </button>
      <AiVaultPanel workspaceHost={scope.hostId} onOpenSession={onOpenSession} />
    </div>
  )
}

/** Honest hint when the project has no per-repo worktree base configured. */
export function CycleBasePathNotice({ workspaceDir }: { workspaceDir: string }) {
  return (
    <p className="vc-notice vc-notice-info">
      本项目未配置单仓工作树基址，固定树按 Orca 全局默认落在 {workspaceDir || '默认工作区目录'}{' '}
      下；如需放入项目目录，可在 设置 &gt; Repository worktree defaults 设相对路径（如
      `.bw/worktrees`），下次建树生效。
    </p>
  )
}
