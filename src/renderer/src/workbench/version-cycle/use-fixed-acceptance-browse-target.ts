import { useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '@/store'
import { useVisibleRuntimeSessionActiveRepo } from '@/store/repos/use-visible-runtime-session-repos'
import type { VersionWorkflow } from '../../../../shared/workbench/version-document'
import { clearFixedAcceptanceBrowse, useFixedAcceptanceBrowse } from '../cycle-view-state'

/** Keep immutable snapshots scoped to the originating navigation, not mutable registrations. */
export function useFixedAcceptanceBrowseTarget(workflow: VersionWorkflow | null) {
  const activeView = useAppStore((state) => state.activeView)
  const repoId = useVisibleRuntimeSessionActiveRepo()?.id ?? null
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const activeExecutionHostId = useAppStore((state) => state.activeWorkspaceExecutionHostId)
  const fixedAcceptance = useFixedAcceptanceBrowse()
  const fixedBrowse = useMemo(() => {
    if (
      !fixedAcceptance ||
      activeView !== 'artifacts' ||
      workflow !== 'acceptance' ||
      repoId !== fixedAcceptance.scope.repoId ||
      activeWorktreeId !== fixedAcceptance.originWorktreeId ||
      activeExecutionHostId !== fixedAcceptance.originExecutionHostId
    ) {
      return null
    }
    // A registration refresh/disconnect must not turn verified snapshots into
    // a request to prepare an acceptance tree. Only navigation leaves this view.
    return fixedAcceptance
  }, [fixedAcceptance, activeView, workflow, repoId, activeWorktreeId, activeExecutionHostId])
  const visitedFixedBrowse = useRef<typeof fixedAcceptance>(null)
  useEffect(() => {
    if (fixedBrowse) {
      visitedFixedBrowse.current = fixedBrowse
    } else if (fixedAcceptance && visitedFixedBrowse.current === fixedAcceptance) {
      clearFixedAcceptanceBrowse()
    }
  }, [fixedAcceptance, fixedBrowse])
  return fixedBrowse
}
