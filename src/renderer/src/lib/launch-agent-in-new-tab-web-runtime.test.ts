import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../../shared/global-settings-types'

const mocks = vi.hoisted(() => ({
  createTab: vi.fn(),
  closeTab: vi.fn(),
  createWebRuntimeSessionTerminal: vi.fn(),
  deliverCreatedWebRuntimeAgentSessionPrompt: vi.fn(),
  setActiveTabType: vi.fn()
}))

const store = {
  activeRepoId: 'repo-1',
  activeWorktreeId: 'wt-1',
  settings: {
    agentCmdOverrides: {} as Record<string, string>,
    agentDefaultArgs: {} as Record<string, string>,
    agentDefaultEnv: {} as Record<string, Record<string, string>>,
    activeRuntimeEnvironmentId: 'web-runtime' as string | null,
    experimentalNativeChat: false,
    experimentalStructuredNativeChat: false,
    openAgentTabsInChatByDefault: false,
    nativeChatSessionOptions: undefined as GlobalSettings['nativeChatSessionOptions']
  },
  projects: [{ id: 'repo-1', localWindowsRuntimePreference: { kind: 'inherit-global' as const } }],
  repos: [{ id: 'repo-1', connectionId: null, path: '/repo' }],
  worktreesByRepo: {
    'repo-1': [
      {
        id: 'wt-1',
        repoId: 'repo-1',
        projectId: 'repo-1',
        path: '/repo/worktree',
        displayName: 'main'
      }
    ]
  },
  tabsByWorktree: { 'wt-1': [{ id: 'tab-1' }] as { id: string; launchAgent?: string }[] },
  openFiles: [] as { id: string; worktreeId: string }[],
  browserTabsByWorktree: {} as Record<string, { id: string }[]>,
  tabBarOrderByWorktree: {} as Record<string, string[]>,
  terminalLayoutsByTabId: {},
  ptyIdsByTabId: {},
  runtimeStatusByEnvironmentId: new Map(),
  sshConnectionStates: new Map(),
  transientClearedAgentStatusConnectionIds: {},
  allWorktrees: vi.fn(() => store.worktreesByRepo['repo-1']),
  createTab: mocks.createTab,
  closeTab: mocks.closeTab,
  queueTabStartupCommand: vi.fn(),
  setActiveTabType: mocks.setActiveTabType,
  setTabBarOrder: vi.fn(),
  setAgentStatus: vi.fn(),
  seedNativeChatLaunchPrompt: vi.fn(),
  markNativeChatLaunchPromptFailed: vi.fn()
}

vi.mock('@/store', () => ({ useAppStore: { getState: () => store } }))
vi.mock('sonner', () => ({ toast: { message: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/tab-bar/reconcile-order', () => ({ reconcileTabOrder: vi.fn(() => []) }))
vi.mock('@/lib/agent-paste-draft', () => ({ pasteDraftWhenAgentReady: vi.fn() }))
vi.mock('@/lib/telemetry', () => ({
  track: vi.fn(),
  tuiAgentToAgentKind: (agent: string) => agent
}))
vi.mock('@/runtime/web-runtime-terminal-create-operation', () => ({
  createWebRuntimeSessionTerminalResult: async (args: unknown) => ({
    outcome: await mocks.createWebRuntimeSessionTerminal(args)
  })
}))
vi.mock('@/runtime/web-runtime-session', () => ({
  createWebRuntimeSessionTerminal: mocks.createWebRuntimeSessionTerminal,
  deliverCreatedWebRuntimeAgentSessionPrompt: mocks.deliverCreatedWebRuntimeAgentSessionPrompt,
  isWebRuntimeSessionActive: vi.fn(() => true),
  isWebTerminalSurfaceTabId: vi.fn(() => false)
}))

describe('launchAgentInNewTab paired web runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    store.settings = {
      agentCmdOverrides: {},
      agentDefaultArgs: {},
      agentDefaultEnv: {},
      activeRuntimeEnvironmentId: 'web-runtime',
      experimentalNativeChat: false,
      experimentalStructuredNativeChat: false,
      openAgentTabsInChatByDefault: false,
      nativeChatSessionOptions: undefined
    }
    store.tabsByWorktree = { 'wt-1': [{ id: 'tab-1' }] }
    mocks.createWebRuntimeSessionTerminal.mockResolvedValue({ status: 'created' })
    mocks.deliverCreatedWebRuntimeAgentSessionPrompt.mockResolvedValue(true)
  })

  it('delegates agent quick launch to the host runtime', async () => {
    store.tabsByWorktree['wt-1'].push({ id: 'stale-agent-tab', launchAgent: 'claude' })
    const { launchAgentInNewTab } = await import('./launch-agent-in-new-tab')

    const result = launchAgentInNewTab({
      agent: 'claude',
      worktreeId: 'wt-1',
      groupId: 'group-1'
    })

    expect(result).toEqual(expect.objectContaining({ tabId: null, pasteDraftAfterLaunch: false }))
    expect(mocks.createWebRuntimeSessionTerminal).toHaveBeenCalledWith({
      worktreeId: 'wt-1',
      environmentId: 'web-runtime',
      expectedEnvironmentRuntimeId: undefined,
      legacyAgentLaunch: expect.any(Function),
      targetGroupId: 'group-1',
      activate: true,
      agentSessionKind: 'fresh',
      selectWorktree: true,
      agent: 'claude',
      launchAgent: 'claude',
      viewMode: 'terminal'
    })
    expect(mocks.createTab).not.toHaveBeenCalled()
    await result?.runtimeLaunch
    expect(mocks.setActiveTabType).toHaveBeenCalledWith('terminal')
    expect(mocks.closeTab).toHaveBeenCalledWith('stale-agent-tab', { reason: 'cleanup' })
  })

  it('leaves fresh host launch defaults on the execution host', async () => {
    store.settings.agentDefaultArgs = { codex: '--model gpt-5 --reasoning-effort high' }
    store.settings.agentDefaultEnv = { codex: { CODEX_PROFILE: 'captured' } }
    const { launchAgentInNewTab } = await import('./launch-agent-in-new-tab')

    const result = launchAgentInNewTab({
      agent: 'codex',
      worktreeId: 'wt-1',
      prompt: 'fix the spinner',
      groupId: 'group-1'
    })

    expect(result).toEqual(expect.objectContaining({ tabId: null, pasteDraftAfterLaunch: false }))
    expect(mocks.createWebRuntimeSessionTerminal).toHaveBeenCalledWith({
      worktreeId: 'wt-1',
      environmentId: 'web-runtime',
      targetGroupId: 'group-1',
      expectedEnvironmentRuntimeId: undefined,
      legacyAgentLaunch: expect.any(Function),
      activate: true,
      agentSessionKind: 'fresh',
      selectWorktree: true,
      launchAgent: 'codex',
      agent: 'codex',
      prompt: 'fix the spinner',
      promptDelivery: 'auto-submit',
      viewMode: 'terminal'
    })
    expect(mocks.createTab).not.toHaveBeenCalled()
  })

  it('preserves paired-host drafts and explicit arguments without desktop defaults', async () => {
    store.settings = {
      agentCmdOverrides: {},
      agentDefaultArgs: {},
      agentDefaultEnv: {},
      activeRuntimeEnvironmentId: 'web-runtime',
      experimentalNativeChat: true,
      experimentalStructuredNativeChat: true,
      openAgentTabsInChatByDefault: true,
      nativeChatSessionOptions: {
        claude: {
          model: 'opus',
          valuesByModel: { opus: { effort: 'high', fastMode: true } }
        }
      }
    }
    const { launchAgentInNewTab } = await import('./launch-agent-in-new-tab')

    const result = launchAgentInNewTab({
      agent: 'claude',
      worktreeId: 'wt-1',
      prompt: 'review before sending',
      promptDelivery: 'draft',
      agentArgs: '--permission-mode plan'
    })

    expect(result).toEqual(expect.objectContaining({ tabId: null, pasteDraftAfterLaunch: false }))
    expect(mocks.createWebRuntimeSessionTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        launchAgent: 'claude',
        prompt: 'review before sending',
        promptDelivery: 'draft',
        agentArgs: '--permission-mode plan',
        agent: 'claude',
        legacyAgentLaunch: expect.any(Function)
      })
    )
    await result?.runtimeLaunch
    expect(mocks.createWebRuntimeSessionTerminal.mock.calls.at(-1)?.[0]).not.toHaveProperty(
      'launchPreferences'
    )
    expect(mocks.deliverCreatedWebRuntimeAgentSessionPrompt).toHaveBeenCalledWith(
      expect.any(Object),
      { agent: 'claude', launchDraft: 'review before sending' }
    )
    expect(mocks.createTab).not.toHaveBeenCalled()
  })
})
