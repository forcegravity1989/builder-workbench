import { useAppStore } from '@/store'
import type { CycleScope } from './ports'
import { cycleScopeForWorktree, cycleScopeKey } from './native-cycle-workspace'

/**
 * A manual launch belongs to the workspace the user is looking at: before and
 * while waiting for the run, the fixed tree must still be the active terminal
 * view on the same host identity. A silent switch aborts the launch instead of
 * opening a session somewhere else.
 */
export function assertCurrentCycleWorkspace(scope: CycleScope, worktreeId: string) {
  const state = useAppStore.getState()
  const worktree = state.getKnownWorktreeById(
    worktreeId,
    state.activeWorkspaceExecutionHostId ?? undefined
  )
  if (
    state.activeView !== 'terminal' ||
    state.activeWorktreeId !== worktreeId ||
    !worktree ||
    cycleScopeKey(cycleScopeForWorktree(worktree, scope.workflow)) !== cycleScopeKey(scope)
  ) {
    throw new Error('工作区已切换，请回到对应流程后重试。')
  }
}
