import { useAppStore } from '@/store'
import { branchName } from '@/lib/git-utils'
import { isWorkbenchShell } from './is-workbench-shell'
import { METRICS_BRANCH } from './version-cycle/metrics-setup'

/** The metrics maintenance worktree is the visible terminal workspace. */
export function useMetricsWorkspaceOpen(): boolean {
  const activeView = useAppStore((state) => state.activeView)
  const branch = useAppStore((state) => {
    const id = state.activeWorktreeId
    const worktree = id ? state.getKnownWorktreeById(id) : null
    return worktree?.branch ? branchName(worktree.branch) : ''
  })
  return isWorkbenchShell() && activeView === 'terminal' && branch === METRICS_BRANCH
}
