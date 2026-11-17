import { useAppStore } from '@/store'
import { branchName } from '@/lib/git-utils'
import { isMonicaShell } from './is-monica-shell'
import { METRICS_BRANCH } from './version-cycle/metrics-setup'

/** The metrics maintenance worktree is the visible terminal workspace. */
export function useMetricsWorkspaceOpen(): boolean {
  const activeView = useAppStore((state) => state.activeView)
  const branch = useAppStore((state) => {
    const id = state.activeWorktreeId
    const worktree = id ? state.getKnownWorktreeById(id) : null
    return worktree?.branch ? branchName(worktree.branch) : ''
  })
  return isMonicaShell() && activeView === 'terminal' && branch === METRICS_BRANCH
}
