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

import { AgentBrowserBridge } from './agent-browser-bridge'
import { AGENT_BROWSER_IDLE_TIMEOUT_MS } from './helper-process/agent-browser-process-environment'
import {
  agentBrowserCommandsIn,
  answerAgentBrowserCommands,
  createSucceedWith,
  mockBrowserManager,
  overrideBridgeWebContentsLookup,
  resetAgentBrowserBridgeMocks
} from './testing/agent-browser-bridge-test-harness'

overrideBridgeWebContentsLookup(AgentBrowserBridge.prototype, webContentsFromIdMock)

const succeedWith = createSucceedWith(execFileMock, stdinWrites)

function failWith(error: string): void {
  answerAgentBrowserCommands(execFileMock, stdinWrites, (command, cb) => {
    cb(
      null,
      JSON.stringify(
        command.includes('close') ? { success: true, data: null } : { success: false, error }
      ),
      ''
    )
  })
}

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

  it('translates error response to BrowserError', async () => {
    failWith('Element not found')
    await expect(bridge.click('@e1')).rejects.toThrow('Element not found')
  })

  it('handles malformed JSON from agent-browser', async () => {
    answerAgentBrowserCommands(execFileMock, stdinWrites, (command, cb) => {
      cb(
        null,
        command.includes('close')
          ? JSON.stringify({ success: true, data: null })
          : 'not json at all',
        ''
      )
    })
    await expect(bridge.snapshot()).rejects.toMatchObject({
      code: 'browser_error',
      message: 'Unexpected output from agent-browser: not json at all'
    })
  })

  it('serializes concurrent commands per session', async () => {
    const commandCalls: string[][] = []
    let releaseSnapshot: (() => void) | null = null
    answerAgentBrowserCommands(execFileMock, stdinWrites, (command, cb) => {
      commandCalls.push(command)
      if (command[0] === 'snapshot') {
        releaseSnapshot = () => cb(null, JSON.stringify({ success: true, data: { ok: true } }), '')
        return
      }
      cb(null, JSON.stringify({ success: true, data: { ok: true } }), '')
    })

    const pending = Promise.all([bridge.snapshot(), bridge.click('@e1')])
    await vi.waitFor(() => expect(releaseSnapshot).not.toBeNull())
    expect(commandCalls.some((command) => command[0] === 'click')).toBe(false)
    releaseSnapshot!()
    const [r1, r2] = await pending
    expect(r1).toEqual({
      browserPageId: 'tab-1',
      url: 'https://example.com',
      title: 'Example',
      ok: true
    })
    expect(r2).toEqual({ ok: true })
    expect(commandCalls.findIndex((command) => command[0] === 'snapshot')).toBeLessThan(
      commandCalls.findIndex((command) => command[0] === 'click')
    )
  })

  it('enforces conditional wait timeouts at the bridge layer', async () => {
    succeedWith({ selector: '#ready', waited: 'selector' })

    await bridge.wait({ selector: '#ready', timeout: 1200 })

    const args = agentBrowserCommandsIn(stdinWrites).at(-1)!
    const options = execFileMock.mock.calls.at(-1)![2] as { timeout?: number; env?: unknown }
    expect(args).toContain('wait')
    expect(args).toContain('#ready')
    // The helper gets five seconds to report its own conditional-wait timeout.
    expect(options.timeout).toBe(6200)
    // Why not toBe(process.env): the bridge hands the daemon an idle-lifetime bound (#16367).
    const env = options.env as NodeJS.ProcessEnv
    expect(env.PATH).toBe(process.env.PATH)
    expect(env.AGENT_BROWSER_IDLE_TIMEOUT_MS).toBe(String(AGENT_BROWSER_IDLE_TIMEOUT_MS))
  })
})
