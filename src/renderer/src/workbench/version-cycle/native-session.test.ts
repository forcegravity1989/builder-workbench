import { beforeEach, expect, it, vi } from 'vitest'
import type { AppState } from '@/store/types'
import type { CycleScope } from './ports'
import { structuredAgentSessionPaneKey } from '../../../../shared/structured-agent-session-projection'
const mocks = vi.hoisted(() => ({
  state: {} as AppState
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('./native-cycle-workspace', () => ({
  cycleScopeForWorktree: (tree: { hostId: string }, workflow: string) => ({
    projectId: 'p',
    repoId: 'repo',
    hostId: tree.hostId,
    workflow
  }),
  cycleScopeKey: (value: CycleScope) =>
    JSON.stringify([value.projectId, value.repoId, value.hostId, value.workflow])
}))
import { getActiveCycleSession } from './native-session'
const scope: CycleScope = { projectId: 'p', repoId: 'repo', hostId: 'local', workflow: 'plan' }
const leaf = '12345678-1234-4123-8123-123456789012'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.state = {
    lastTerminalInputAtByPaneKey: {},
    activeWorktreeId: 'wt',
    activeTabId: 'terminal-a',
    getKnownWorktreeById: () => ({ hostId: 'local' }),
    getActiveTab: () => ({
      id: 'b',
      contentType: 'agent-session',
      entityId: 'session-b',
      label: 'B',
      customLabel: null
    }),
    tabsByWorktree: { wt: [{ id: 'terminal-a', title: 'A' }] },
    terminalLayoutsByTabId: { 'terminal-a': { activeLeafId: leaf } }
  } as unknown as AppState
})
it('uses the focused native session, not the first tab or a saved BW binding', () => {
  expect(getActiveCycleSession(mocks.state, scope, 'wt')).toMatchObject({
    tabId: 'b',
    sessionId: 'session-b',
    paneKey: structuredAgentSessionPaneKey('b', 'session-b')
  })
})
it('does not target an old terminal when the focused native tab is a file', () => {
  mocks.state.getActiveTab = () => ({ contentType: 'editor' }) as never
  expect(getActiveCycleSession(mocks.state, scope, 'wt')).toBeNull()
})
it('uses the native focused terminal leaf without creating a layout', () => {
  mocks.state.getActiveTab = () => ({ contentType: 'terminal', entityId: 'terminal-a' }) as never
  expect(getActiveCycleSession(mocks.state, scope, 'wt')).toMatchObject({
    tabId: 'terminal-a',
    paneKey: `terminal-a:${leaf}`
  })
})
it('rejects a workspace with the same id on another host', () => {
  mocks.state.getKnownWorktreeById = () => ({ hostId: 'ssh:elsewhere' }) as never
  expect(getActiveCycleSession(mocks.state, scope, 'wt')).toBeNull()
})
