import { useAppStore } from '@/store'
import { cycleWorkflowForWorktree } from '../monica-nav'
import { isMonicaShell } from '../is-monica-shell'
import { useCycleView } from '../cycle-view-state'

export function useCycleWorkspaceWorkflow() {
  const requested = useCycleView()
  const activeView = useAppStore((state) => state.activeView)
  const activeWorkflow = useAppStore((state) =>
    cycleWorkflowForWorktree(
      state.activeWorktreeId
        ? state.getKnownWorktreeById(
            state.activeWorktreeId,
            state.activeWorkspaceExecutionHostId ?? undefined
          )
        : null
    )
  )
  if (!isMonicaShell()) {
    return null
  }
  return activeView === 'artifacts' ? requested : activeView === 'terminal' ? activeWorkflow : null
}
