import type { AppState } from '../../store/types'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'

export function toggleAgentDashboardFromShortcut(
  state: Pick<
    AppState,
    | 'activeView'
    | 'settings'
    | 'agentDashboardDrawerOpen'
    | 'setSidebarOpen'
    | 'setAgentDashboardDrawerOpen'
  >,
  openPopout: () => void
): void {
  if (
    state.activeView === 'settings' ||
    state.settings?.experimentalAgentDashboardPopout !== true
  ) {
    return
  }
  // Why: a profile that persisted 'popout' outside the Workbench shell must not open an Orca
  // pop-out window inside the shell; there the dashboard always opens in-window.
  if (!isWorkbenchShell() && state.settings.experimentalAgentDashboardMode === 'popout') {
    openPopout()
    return
  }
  const nextOpen = !state.agentDashboardDrawerOpen
  // The drawer self-closes with the sidebar: reveal only when opening, never while closing.
  if (nextOpen) {
    state.setSidebarOpen(true)
  }
  state.setAgentDashboardDrawerOpen(nextOpen)
}
