import type { AppState } from '../../store/types'

export function toggleAgentDashboardFromShortcut(
  state: Pick<
    AppState,
    | 'activeView'
    | 'settings'
    | 'agentDashboardDrawerOpen'
    | 'setSidebarOpen'
    | 'setAgentDashboardDrawerOpen'
  >
): void {
  if (
    state.activeView === 'settings' ||
    state.settings?.experimentalAgentDashboardPopout !== true
  ) {
    return
  }
  const nextOpen = !state.agentDashboardDrawerOpen
  // The drawer self-closes with the sidebar: reveal only when opening, never while closing.
  if (nextOpen) {
    state.setSidebarOpen(true)
  }
  state.setAgentDashboardDrawerOpen(nextOpen)
}
