import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getKnownWorktreeById: vi.fn(),
  setActiveWorktree: vi.fn(),
  launchAgentInNewTab: vi.fn(),
  getExecutionHostIdForWorktree: vi.fn(),
  ensureAgentLaunchPreferences: vi.fn(async () => ({ disabledTuiAgents: [], isAvailable: true }))
}))

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      settings: null,
      getKnownWorktreeById: mocks.getKnownWorktreeById,
      setActiveWorktree: mocks.setActiveWorktree
    })
  }
}))
vi.mock('@/lib/launch-agent-in-new-tab', () => ({
  launchAgentInNewTab: mocks.launchAgentInNewTab
}))
vi.mock('@/lib/worktree-runtime-owner', () => ({
  getExecutionHostIdForWorktree: mocks.getExecutionHostIdForWorktree
}))
vi.mock('@/runtime/agent-launch-settings/use-host-agent-launch-preferences', () => ({
  ensureAgentLaunchPreferences: mocks.ensureAgentLaunchPreferences
}))

import { launchDashboardAgent } from './launch-dashboard-agent'

describe('launchDashboardAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getExecutionHostIdForWorktree.mockReturnValue('ssh:docs')
    mocks.getKnownWorktreeById.mockReturnValue({ id: 'folder:docs' })
    mocks.launchAgentInNewTab.mockReturnValue({ tabId: 'tab-1' })
  })

  it('activates a folder or git workspace on its execution host before launching', async () => {
    await expect(launchDashboardAgent({ worktreeId: 'folder:docs', agent: 'codex' })).resolves.toBe(true)
    expect(mocks.ensureAgentLaunchPreferences).toHaveBeenCalledWith('folder:docs')
    expect(mocks.getKnownWorktreeById).toHaveBeenCalledWith('folder:docs', 'ssh:docs')
    expect(mocks.setActiveWorktree).toHaveBeenCalledWith('folder:docs', 'ssh:docs')
    expect(mocks.launchAgentInNewTab).toHaveBeenCalledWith({
      agent: 'codex',
      worktreeId: 'folder:docs',
      launchSource: 'unknown'
    })
  })
})
