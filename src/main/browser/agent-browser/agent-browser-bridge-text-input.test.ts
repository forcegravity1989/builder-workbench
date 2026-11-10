import { describe, it, expect, vi, beforeEach } from 'vitest'

const { execFileMock, webContentsFromIdMock, existsSyncMock, readFileSyncMock, stdinWrites } =
  vi.hoisted(() => ({
    execFileMock: vi.fn(),
    webContentsFromIdMock: vi.fn(),
    existsSyncMock: vi.fn(() => false),
    readFileSyncMock: vi.fn(() => Buffer.from('')),
    stdinWrites: [] as string[]
  }))

vi.mock('child_process', () => ({ execFile: execFileMock }))
vi.mock('fs', () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
  accessSync: vi.fn(),
  chmodSync: vi.fn(),
  constants: { X_OK: 1 }
}))
vi.mock('os', () => ({ platform: () => 'darwin', arch: () => 'arm64' }))
vi.mock('electron', () => {
  return {
    app: { getPath: vi.fn(() => '/app'), getAppPath: vi.fn(() => '/project'), isPackaged: false },
    webContents: { fromId: webContentsFromIdMock }
  }
})
const { CdpWsProxyMock } = vi.hoisted(() => {
  const instances: unknown[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockClass = vi.fn().mockImplementation(function (this: any, _wc: unknown) {
    this._wc = _wc
    this.start = vi.fn(async () => 'ws://127.0.0.1:9222')
    this.stop = vi.fn(async () => {})
    this.getPort = vi.fn(() => 9222)
    instances.push(this)
  })
  return { CdpWsProxyMock: Object.assign(MockClass, { instances }) }
})

vi.mock('../cdp/transport/cdp-ws-proxy', () => ({
  CdpWsProxy: CdpWsProxyMock
}))
vi.mock('../cdp/commands/cdp-bridge', () => ({
  BrowserError: class BrowserError extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  }
}))

import { AGENT_BROWSER_TEXT_ARGUMENT_MAX_BYTES } from './protocol/agent-browser-text-argument-budget'
import { AgentBrowserBridge } from './agent-browser-bridge'
import {
  CLIPBOARD_TEXT_WRITE_MAX_BYTES,
  CLIPBOARD_TEXT_WRITE_TOO_LARGE_ERROR
} from '../../../shared/clipboard-text'
import {
  agentBrowserCommandsIn,
  createSucceedWith,
  mockBrowserManager,
  mockWebContents,
  overrideBridgeWebContentsLookup,
  resetAgentBrowserBridgeMocks
} from './testing/agent-browser-bridge-test-harness'

overrideBridgeWebContentsLookup(AgentBrowserBridge.prototype, webContentsFromIdMock)

const succeedWith = createSucceedWith(execFileMock, stdinWrites)

describe('AgentBrowserBridge', () => {
  let bridge: AgentBrowserBridge

  beforeEach(() => {
    resetAgentBrowserBridgeMocks({
      webContentsFromIdMock,
      existsSyncMock,
      readFileSyncMock,
      stdinWrites,
      cdpWsProxyInstances: CdpWsProxyMock.instances
    })
    bridge = new AgentBrowserBridge(mockBrowserManager())
    bridge.setActiveTab(100)
  })

  it('rejects oversized browser clipboard writes before spawning agent-browser', async () => {
    const secret = 'browser-clipboard-secret'
    succeedWith({ ok: true })

    await expect(
      bridge.clipboardWrite(secret + 'x'.repeat(CLIPBOARD_TEXT_WRITE_MAX_BYTES + 1))
    ).rejects.toThrow(CLIPBOARD_TEXT_WRITE_TOO_LARGE_ERROR)

    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('chunks large agent-browser keyboard insert text before transport', async () => {
    const text = ['z'.repeat(AGENT_BROWSER_TEXT_ARGUMENT_MAX_BYTES), 'qq'].join('')
    succeedWith({ inserted: true })

    await bridge.keyboardInsertText(text)

    const chunks = agentBrowserCommandsIn(stdinWrites)
      .filter((command) => command[0] === 'keyboard' && command[1] === 'inserttext')
      .map((command) => command[2])

    expect(chunks).toEqual(['z'.repeat(AGENT_BROWSER_TEXT_ARGUMENT_MAX_BYTES), 'qq'])
  })

  // ── Cross-worktree text-injection guard ──

  describe('scoped target for text-mutating commands', () => {
    function twoWorktreeBridge(): AgentBrowserBridge {
      const tabs = new Map([
        ['tab-a', 1],
        ['tab-b', 2]
      ])
      const worktrees = new Map([
        ['tab-a', 'wt-1'],
        ['tab-b', 'wt-2']
      ])
      const wc1 = mockWebContents(1, 'https://a.com', 'A')
      const wc2 = mockWebContents(2, 'https://b.com', 'B')
      webContentsFromIdMock.mockImplementation((id: number) => (id === 1 ? wc1 : wc2))
      return new AgentBrowserBridge(mockBrowserManager(tabs, worktrees))
    }

    function sessionNamesUsed(): string[] {
      return execFileMock.mock.calls
        .filter((call: unknown[]) => (call[1] as string[]).includes('--session'))
        .map((call: unknown[]) => {
          const args = call[1] as string[]
          return args[args.indexOf('--session') + 1]
        })
    }

    it.each([
      ['inserttext', (b: AgentBrowserBridge) => b.keyboardInsertText('x', undefined, undefined)],
      ['type', (b: AgentBrowserBridge) => b.type('x', undefined, undefined)],
      ['fill', (b: AgentBrowserBridge) => b.fill('@input', 'x', undefined, undefined)]
    ])(
      'refuses %s when worktrees are ambiguous instead of routing to the global active tab',
      async (_name, run) => {
        const b = twoWorktreeBridge()
        // Why: simulates the user viewing worktree B's tab, which sets the global
        // active webContents — the bug would route the agent's text there.
        b.onTabChanged(2, 'wt-2')
        succeedWith({ inserted: true })

        await expect(run(b)).rejects.toMatchObject({
          code: 'browser_target_ambiguous'
        })
        // Must not have dispatched the command to worktree B's session.
        expect(sessionNamesUsed()).not.toContain('orca-tab-tab-b')
      }
    )
  })
})
