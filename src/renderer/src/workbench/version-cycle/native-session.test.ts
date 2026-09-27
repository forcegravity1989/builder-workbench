import { beforeEach, describe, expect, it, vi } from 'vitest'
import { structuredAgentSessionPaneKey } from '../../../../shared/structured-agent-session-projection'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import type { CycleScope } from './ports'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  launchAiVaultSessionInNewTab: vi.fn(),
  prepareAiVaultSessionForResume: vi.fn(),
  buildAiVaultResumeStartupForWorktree: vi.fn(),
  revealStructuredSession: vi.fn(),
  refreshStructuredSessionTabs: vi.fn(),
  refreshWebRuntimeSessionTabsSnapshot: vi.fn(),
  findOriginalAiVaultSessionPane: vi.fn(),
  requestBackgroundTerminalWorktreeMount: vi.fn(),
  seedTerminalLayoutIfNeeded: vi.fn()
}))

vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('@/lib/launch-agent-in-new-tab', () => ({ launchAgentInNewTab: vi.fn() }))
vi.mock('@/lib/launch-ai-vault-session', () => ({
  launchAiVaultSessionInNewTab: mocks.launchAiVaultSessionInNewTab
}))
vi.mock('@/lib/ai-vault-session-resume-preparation', () => ({
  prepareAiVaultSessionForResume: mocks.prepareAiVaultSessionForResume
}))
vi.mock('@/lib/ai-vault-resume-command', () => ({
  buildAiVaultResumeStartupForWorktree: mocks.buildAiVaultResumeStartupForWorktree
}))
vi.mock('@/lib/activate-ai-vault-structured-session', () => ({
  revealStructuredSession: mocks.revealStructuredSession,
  refreshStructuredSessionTabs: mocks.refreshStructuredSessionTabs
}))
vi.mock('@/components/right-sidebar/ai-vault-original-pane', () => ({
  findOriginalAiVaultSessionPane: mocks.findOriginalAiVaultSessionPane
}))
vi.mock('@/components/terminal/background-terminal-worktree-mount', () => ({
  requestBackgroundTerminalWorktreeMount: mocks.requestBackgroundTerminalWorktreeMount
}))
vi.mock('@/runtime/web-terminal-surface-id', () => ({
  toWebTerminalSurfaceTabId: (id: string) => `web::${id}`
}))
vi.mock('@/runtime/web-runtime-session', () => ({
  refreshWebRuntimeSessionTabsSnapshot: mocks.refreshWebRuntimeSessionTabsSnapshot
}))
vi.mock('@/runtime/runtime-environment-revision', () => ({
  getRuntimeEnvironmentRevision: vi.fn(() => 1)
}))
vi.mock('@/lib/native-chat-draft-insertion', () => ({ insertNativeChatDraft: vi.fn() }))
vi.mock('./terminal-pane-layout', () => ({
  seedTerminalLayoutIfNeeded: mocks.seedTerminalLayoutIfNeeded
}))
vi.mock('./native-cycle-workspace', () => ({
  cycleScopeForWorktree: (_worktree: unknown, workflow: string) => ({ ...scope, workflow }),
  cycleScopeKey: (value: CycleScope) => JSON.stringify(value)
}))

import { bindCycleTab, openCycleHistory } from './native-session'

const WT = 'repo::/fixed/tree'
const scope: CycleScope = {
  projectId: 'p',
  repoId: 'repo',
  hostId: 'local',
  workflow: 'acceptance'
} as unknown as CycleScope

const structuredTab = {
  id: 'stab-1',
  contentType: 'agent-session',
  entityId: 'sess-1',
  label: '会话标题',
  customLabel: null,
  agentSessionAgent: 'claude'
}

const terminalTab = { id: 'tab-1', title: 'Terminal 1', customTitle: null }

const structuredHistoryRow = {
  agent: 'claude',
  sessionId: 'prov-1',
  structuredSession: { sessionId: 'sess-1', workspaceId: WT }
} as unknown as AiVaultSession

const legacyHistoryRow = {
  agent: 'claude',
  sessionId: 'prov-1'
} as unknown as AiVaultSession

function setStore(partial: Record<string, unknown> = {}) {
  mocks.state = {
    activeWorktreeId: WT,
    activeWorkspaceExecutionHostId: null,
    getKnownWorktreeById: (id: string) => (id === WT ? { id: WT } : undefined),
    unifiedTabsByWorktree: {} as Record<string, unknown[]>,
    tabsByWorktree: {} as Record<string, unknown[]>,
    terminalLayoutsByTabId: {},
    setTabLayout: vi.fn(),
    settings: {},
    ...partial
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  setStore()
  mocks.seedTerminalLayoutIfNeeded.mockImplementation((tabId: string) => ({
    paneKey: `${tabId}:leaf-1`,
    snapshot: { root: null }
  }))
})

describe('bindCycleTab', () => {
  it('binds a structured tab by id with its durable pane key', () => {
    setStore({ unifiedTabsByWorktree: { [WT]: [structuredTab] } })
    const bound = bindCycleTab(scope, WT, 'stab-1')
    expect(bound).toMatchObject({
      kind: 'structured',
      tabId: 'stab-1',
      sessionId: 'sess-1',
      title: '会话标题',
      paneKey: structuredAgentSessionPaneKey('stab-1', 'sess-1')
    })
  })

  it('binds a terminal tab, seeds its layout and requests the background mount', () => {
    setStore({ tabsByWorktree: { [WT]: [terminalTab] } })
    const bound = bindCycleTab(scope, WT, 'tab-1')
    expect(bound).toMatchObject({ kind: 'terminal', tabId: 'tab-1', paneKey: 'tab-1:leaf-1' })
    expect(mocks.state.setTabLayout).toHaveBeenCalledWith('tab-1', { root: null })
    expect(mocks.requestBackgroundTerminalWorktreeMount).toHaveBeenCalledWith({
      worktreeId: WT,
      tabIds: ['tab-1']
    })
  })

  it('names the closed tab honestly when the binding target is gone', () => {
    expect(() => bindCycleTab(scope, WT, 'dead-tab')).toThrow(
      '会话标签页不存在或已关闭，请从历史中重新打开'
    )
  })
})

describe('openCycleHistory', () => {
  it('binds an already-mirrored structured session without revealing', async () => {
    setStore({ unifiedTabsByWorktree: { [WT]: [structuredTab] } })
    const bound = await openCycleHistory(scope, WT, structuredHistoryRow)
    expect(mocks.revealStructuredSession).not.toHaveBeenCalled()
    expect(bound).toMatchObject({ kind: 'structured', sessionId: 'sess-1', tabId: 'stab-1' })
  })

  it('reveals, refreshes and binds a structured session the mirror does not hold yet', async () => {
    mocks.revealStructuredSession.mockResolvedValue('revealed')
    mocks.refreshStructuredSessionTabs.mockImplementation(async () => {
      ;(mocks.state.unifiedTabsByWorktree as Record<string, unknown[]>)[WT] = [structuredTab]
    })
    const bound = await openCycleHistory(scope, WT, structuredHistoryRow)
    expect(mocks.revealStructuredSession).toHaveBeenCalledWith({
      worktreeId: WT,
      sessionId: 'sess-1'
    })
    expect(mocks.refreshStructuredSessionTabs).toHaveBeenCalledWith(WT)
    expect(bound).toMatchObject({ kind: 'structured', sessionId: 'sess-1' })
  })

  it.each([
    ['gone', '该会话已不在宿主上，无法重新打开'],
    ['host-cannot-open', '宿主无法打开该会话，请升级 Orca 后重试'],
    ['unreachable', '宿主暂时不可达，请稍后重试']
  ] as const)('reports reveal refusal %s as an actionable message', async (outcome, message) => {
    mocks.revealStructuredSession.mockResolvedValue(outcome)
    await expect(openCycleHistory(scope, WT, structuredHistoryRow)).rejects.toThrow(message)
  })

  it('rejects a structured row recorded for another workspace', async () => {
    const elsewhere = {
      ...structuredHistoryRow,
      structuredSession: { sessionId: 'sess-1', workspaceId: 'repo::/other' }
    } as unknown as AiVaultSession
    await expect(openCycleHistory(scope, WT, elsewhere)).rejects.toThrow('历史会话不属于当前工作区')
  })

  it('resumes a legacy session into a new inactive terminal tab and binds it', async () => {
    setStore({ tabsByWorktree: { [WT]: [{ id: 'tab-9', title: 'Terminal', customTitle: null }] } })
    mocks.findOriginalAiVaultSessionPane.mockReturnValue(null)
    mocks.prepareAiVaultSessionForResume.mockResolvedValue(legacyHistoryRow)
    mocks.buildAiVaultResumeStartupForWorktree.mockReturnValue({
      command: 'claude --resume prov-1',
      cwd: '/fixed/tree'
    })
    mocks.launchAiVaultSessionInNewTab.mockReturnValue({ tabId: 'tab-9' })
    const bound = await openCycleHistory(scope, WT, legacyHistoryRow)
    expect(mocks.launchAiVaultSessionInNewTab).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'claude', worktreeId: WT, activate: false })
    )
    expect(bound).toMatchObject({ kind: 'terminal', tabId: 'tab-9', paneKey: 'tab-9:leaf-1' })
  })

  it('rebinds the live original pane instead of resuming a second copy', async () => {
    setStore({ tabsByWorktree: { [WT]: [terminalTab] } })
    mocks.findOriginalAiVaultSessionPane.mockReturnValue({
      paneKey: 'tab-1:leaf-live',
      worktreeId: WT,
      tabId: 'tab-1',
      leafId: 'leaf-live'
    })
    const bound = await openCycleHistory(scope, WT, legacyHistoryRow)
    expect(mocks.launchAiVaultSessionInNewTab).not.toHaveBeenCalled()
    expect(bound).toMatchObject({ kind: 'terminal', tabId: 'tab-1', paneKey: 'tab-1:leaf-live' })
  })

  it('refuses when the fixed worktree is no longer the selected one', async () => {
    setStore({ activeWorktreeId: 'repo::/other' })
    await expect(openCycleHistory(scope, WT, legacyHistoryRow)).rejects.toThrow('工作区已切换')
  })
})
