import { describe, expect, it, vi } from 'vitest'
import { toggleAgentDashboardFromShortcut } from './ipc-events/agent-dashboard-command'

function makeState(
  overrides: {
    activeView?: string
    experimentEnabled?: boolean
    drawerOpen?: boolean
  } = {}
) {
  return {
    activeView: overrides.activeView ?? 'terminal',
    settings: {
      experimentalAgentDashboardPopout: overrides.experimentEnabled ?? true
    },
    agentDashboardDrawerOpen: overrides.drawerOpen ?? false,
    setSidebarOpen: vi.fn(),
    setAgentDashboardDrawerOpen: vi.fn()
  }
}

describe('toggleAgentDashboardFromShortcut', () => {
  it('stays inert while the Agent Dashboard experiment is off', () => {
    const state = makeState({ experimentEnabled: false })

    toggleAgentDashboardFromShortcut(state as never)

    expect(state.setAgentDashboardDrawerOpen).not.toHaveBeenCalled()
    expect(state.setSidebarOpen).not.toHaveBeenCalled()
  })

  it('stays inert in the Settings view', () => {
    const state = makeState({ activeView: 'settings' })

    toggleAgentDashboardFromShortcut(state as never)

    expect(state.setAgentDashboardDrawerOpen).not.toHaveBeenCalled()
  })

  it('reveals the sidebar when opening the in-window drawer', () => {
    const state = makeState({ drawerOpen: false })

    toggleAgentDashboardFromShortcut(state as never)

    expect(state.setSidebarOpen).toHaveBeenCalledWith(true)
    expect(state.setAgentDashboardDrawerOpen).toHaveBeenCalledWith(true)
  })

  it('leaves the sidebar alone when closing the in-window drawer', () => {
    // Why: forcing the sidebar open on close would re-reveal a panel the user
    // just dismissed, and the drawer's own collapse effect would fight it.
    const state = makeState({ drawerOpen: true })

    toggleAgentDashboardFromShortcut(state as never)

    expect(state.setAgentDashboardDrawerOpen).toHaveBeenCalledWith(false)
    expect(state.setSidebarOpen).not.toHaveBeenCalled()
  })
})
