import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import type { Worktree } from '../../../../../../shared/worktree/types'

type ProjectScope = { repoId: string; repoIds: readonly string[] }

export function useWorkbenchProjectFold(
  project: ProjectScope | undefined,
  worktrees: ReadonlyMap<string, Worktree>
) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const key = project ? JSON.stringify([...project.repoIds].sort()) : ''
  const pendingWorktree = useAppStore((state) => state.pendingRevealWorktree)
  const pendingRow = useAppStore((state) => state.pendingRevealSidebarRow)
  useEffect(() => {
    if (!key || !project || (!pendingWorktree && !pendingRow)) {
      return
    }
    const requested = pendingWorktree
      ? [...worktrees.values()].find(
          (tree) =>
            tree.id === pendingWorktree.worktreeId &&
            (!pendingWorktree.executionHostId || tree.hostId === pendingWorktree.executionHostId)
        )
      : null
    if (pendingRow || !requested || !project.repoIds.includes(requested.repoId)) {
      setExpanded((current) => (current[key] ? current : { ...current, [key]: true }))
    }
  }, [key, project, worktrees, pendingWorktree, pendingRow])
  const toggle = useCallback(() => {
    if (key) {
      setExpanded((current) => ({ ...current, [key]: !current[key] }))
    }
  }, [key])
  const setProjectExpanded = useCallback(
    (value: boolean) => {
      if (key) {
        setExpanded((current) => ({ ...current, [key]: value }))
      }
    },
    [key]
  )
  return { expanded: !!expanded[key], toggle, setExpanded: setProjectExpanded }
}
