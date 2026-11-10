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
  createSucceedWith,
  mockBrowserManager,
  overrideBridgeWebContentsLookup,
  resetAgentBrowserBridgeMocks,
  type ExecFileCallback
} from './testing/agent-browser-bridge-test-harness'

overrideBridgeWebContentsLookup(AgentBrowserBridge.prototype, webContentsFromIdMock)

const succeedWith = createSucceedWith(execFileMock, stdinWrites)

function failWith(error: string): void {
  execFileMock.mockImplementation(
    (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
      cb(null, JSON.stringify({ success: false, error }), '')
    }
  )
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
    execFileMock.mockImplementation(
      (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
        cb(null, 'not json at all', '')
      }
    )
    await expect(bridge.snapshot()).rejects.toThrow()
  })

  // ── Command queue serialization ──

  it('serializes concurrent commands per session', async () => {
    const commandCalls: string[][] = []

    execFileMock.mockImplementation(
      (_bin: string, args: string[], _opts: unknown, cb: ExecFileCallback) => {
        commandCalls.push(args)
        cb(null, JSON.stringify({ success: true, data: { ok: true } }), '')
      }
    )

    const [r1, r2] = await Promise.all([bridge.snapshot(), bridge.click('@e1')])
    expect(r1).toEqual({ browserPageId: 'tab-1', ok: true })
    expect(r2).toEqual({ ok: true })
    // Why: close runs first (stale session cleanup), then commands execute sequentially
    const snapshotIdx = commandCalls.findIndex((a) => a.includes('snapshot'))
    const clickIdx = commandCalls.findIndex((a) => a.includes('click'))
    expect(snapshotIdx).toBeLessThan(clickIdx)
  })

  it('enforces conditional wait timeouts at the bridge layer', async () => {
    succeedWith({ selector: '#ready', waited: 'selector' })

    await bridge.wait({ selector: '#ready', timeout: 1200 })

    const args = execFileMock.mock.calls.at(-1)![1] as string[]
    const options = execFileMock.mock.calls.at(-1)![2] as { timeout?: number; env?: unknown }
    expect(args).toContain('wait')
    expect(args).toContain('#ready')
    expect(options.timeout).toBe(2200)
    // Why not toBe(process.env): the bridge hands the daemon an idle-lifetime bound (#16367).
    const env = options.env as NodeJS.ProcessEnv
    expect(env.PATH).toBe(process.env.PATH)
    expect(env.AGENT_BROWSER_IDLE_TIMEOUT_MS).toBe(String(AGENT_BROWSER_IDLE_TIMEOUT_MS))
  })
})
