// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CycleSession } from './ports'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  setPortals: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) => selector(mocks.state)
}))
vi.mock('@/components/activity/activity-terminal-portal', () => ({
  setActivityTerminalPortals: mocks.setPortals
}))
vi.mock('@/components/native-chat/NativeChatView', () => ({
  default: (props: { sessionId?: string; agent?: string }) => (
    <div
      data-testid="native-chat-view"
      data-session-id={props.sessionId}
      data-agent={props.agent}
    />
  )
}))
vi.mock('./native-cycle-workspace', () => ({
  cycleRuntimeTarget: () => ({ kind: 'local' })
}))

import { CycleChat } from './CycleChat'

const WT = 'repo::/tree'

const terminalSession: CycleSession = {
  projectId: 'p',
  repoId: 'repo',
  hostId: 'local',
  workflow: 'acceptance',
  worktreeId: WT,
  sessionId: 'tab-1',
  tabId: 'tab-1',
  paneKey: 'tab-1:leaf-1',
  kind: 'terminal',
  title: '会话'
} as unknown as CycleSession

const structuredSession: CycleSession = {
  ...terminalSession,
  sessionId: 'sess-1',
  tabId: 'stab-1',
  paneKey: 'stab-1:leaf-2',
  kind: 'structured'
} as unknown as CycleSession

function setStore(partial: Record<string, unknown>) {
  mocks.state = {
    unifiedTabsByWorktree: {},
    tabsByWorktree: {},
    ...partial
  }
}

function lastPortals(): unknown[] {
  return (mocks.setPortals.mock.calls.at(-1)?.[0] ?? []) as unknown[]
}

beforeEach(() => {
  mocks.setPortals.mockClear()
})

afterEach(cleanup)

describe('CycleChat', () => {
  it('publishes the bw-cycle portal for a live terminal binding', () => {
    setStore({ tabsByWorktree: { [WT]: [{ id: 'tab-1', title: 'Terminal' }] } })
    render(<CycleChat session={terminalSession} />)
    expect(lastPortals()).toEqual([
      expect.objectContaining({
        slotId: 'bw-cycle',
        worktreeId: WT,
        tabId: 'tab-1',
        paneKey: 'tab-1:leaf-1',
        active: true
      })
    ])
    expect(screen.queryByText(/会话已退出/)).toBeNull()
  })

  it('says the session exited instead of the unbound hint when its tab was closed', () => {
    // The resume tab died and Orca auto-closed it: the binding outlives the tab.
    setStore({ tabsByWorktree: {} })
    const { container } = render(<CycleChat session={terminalSession} />)
    expect(lastPortals()).toEqual([])
    expect(container.textContent).toContain('会话已退出或标签页已关闭')
    expect(container.textContent).not.toContain('选择历史会话，或新建本周会话')
  })

  it('keeps the pick-a-session hint while nothing is bound', () => {
    setStore({})
    const { container } = render(<CycleChat session={null} />)
    expect(lastPortals()).toEqual([])
    expect(container.textContent).toContain('选择历史会话，或新建本周会话')
  })

  it('renders the native chat for a live structured binding without a terminal portal', () => {
    setStore({
      unifiedTabsByWorktree: {
        [WT]: [
          {
            id: 'stab-1',
            contentType: 'agent-session',
            entityId: 'sess-1',
            agentSessionAgent: 'claude'
          }
        ]
      }
    })
    render(<CycleChat session={structuredSession} />)
    expect(lastPortals()).toEqual([])
    const view = screen.getByTestId('native-chat-view')
    expect(view.dataset.sessionId).toBe('sess-1')
    expect(view.dataset.agent).toBe('claude')
  })

  it('names the unsupported agent instead of rendering a blank column', () => {
    setStore({
      unifiedTabsByWorktree: {
        [WT]: [
          {
            id: 'stab-1',
            contentType: 'agent-session',
            entityId: 'sess-1',
            agentSessionAgent: 'gemini'
          }
        ]
      }
    })
    const { container } = render(<CycleChat session={structuredSession} />)
    expect(screen.queryByTestId('native-chat-view')).toBeNull()
    expect(container.textContent).toContain('不支持在聊天列渲染')
  })
})
