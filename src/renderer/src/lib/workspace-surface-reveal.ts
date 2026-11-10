import type { AppState } from '@/store/types'
import { isFloatingWorkspaceId } from '../../../shared/floating-workspace-worktree'
import { revealFloatingWorkspacePanel } from './floating-workspace-panel-reveal'
import { reselectWorkspaceKeepingHost } from './active-workspace-host'

/** Select a browser's workspace on its existing owner, preserving floating panel placement. */
export function selectWorkspaceSurface(
  state: Pick<
    AppState,
    | 'settings'
    | 'updateSettings'
    | 'setActiveWorktree'
    | 'activeWorktreeId'
    | 'activeWorkspaceExecutionHostId'
  >,
  worktreeId: string
): void {
  if (isFloatingWorkspaceId(worktreeId)) {
    revealFloatingWorkspacePanel(state)
    return
  }
  reselectWorkspaceKeepingHost(state, worktreeId)
}
