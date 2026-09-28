import { useAppStore } from '@/store'
import { cycleWorkflowForWorktree } from '../workbench-nav'
import { isWorkbenchShell } from '../is-workbench-shell'
import { useCycleView } from '../cycle-view-state'

export function useCycleWorkspaceWorkflow() {
  const requested = useCycleView()
  const activeView = useAppStore((state) => state.activeView)
  const activeWorkflow = useAppStore((state) =>
    cycleWorkflowForWorktree(
      state.activeWorktreeId ? state.getKnownWorktreeById(state.activeWorktreeId) : null
    )
  )
  if (!isWorkbenchShell()) {
    return null
  }
  return activeView === 'artifacts' ? requested : activeView === 'terminal' ? activeWorkflow : null
}
