import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  execFileMock,
  webContentsFromIdMock,
  existsSyncMock,
  readFileSyncMock,
  lstatSyncMock,
  stdinWrites
} = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  webContentsFromIdMock: vi.fn(),
  existsSyncMock: vi.fn(() => false),
  readFileSyncMock: vi.fn(() => Buffer.from('')),
  lstatSyncMock: vi.fn(),
  stdinWrites: [] as string[]
}))

vi.mock('child_process', () => ({ execFile: execFileMock }))
vi.mock('fs', () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
  lstatSync: lstatSyncMock,
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
import {
  answerAgentBrowserCommands,
  createSucceedWith,
  succeedRecordingAgentBrowserSpawns,
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
    // Default to a socket that exists so an unprepared test still takes the reset path.
    lstatSyncMock.mockReset()
    lstatSyncMock.mockReturnValue({})
    bridge = new AgentBrowserBridge(mockBrowserManager())
    bridge.setActiveTab(100)
  })

  it('waits for pending session destruction before recreating the same session', async () => {
    succeedWith({ snapshot: 'initial' })
    await bridge.snapshot()
    execFileMock.mockClear()

    const commandCalls: string[][] = []
    let releaseDestroyClose: (() => void) | null = null
    answerAgentBrowserCommands(execFileMock, stdinWrites, (command, cb) => {
      commandCalls.push(command)
      if (command.includes('close') && !releaseDestroyClose) {
        releaseDestroyClose = () => cb(null, JSON.stringify({ success: true, data: null }), '')
        return
      }
      cb(
        null,
        JSON.stringify({
          success: true,
          data: command.includes('snapshot') ? { snapshot: 'after-destroy' } : null
        }),
        ''
      )
    })

    const destroyPromise = bridge.onPageClosed('tab-1')
    const nextSnapshot = bridge.snapshot()
    await vi.waitFor(() => expect(releaseDestroyClose).not.toBeNull())
    expect(commandCalls.filter((command) => command.includes('close'))).toHaveLength(1)
    expect(commandCalls.some((command) => command.includes('snapshot'))).toBe(false)
    releaseDestroyClose!()
    await destroyPromise
    await expect(nextSnapshot).resolves.toEqual({
      browserPageId: 'tab-1',
      url: 'https://example.com',
      title: 'Example',
      snapshot: 'after-destroy'
    })
    expect(commandCalls.filter((command) => command.includes('close'))).toHaveLength(2)
  })

  it('cancels the command already running when a session is destroyed', async () => {
    succeedWith({ snapshot: 'initial' })
    await bridge.snapshot()
    execFileMock.mockClear()

    const killedError = Object.assign(new Error('killed'), { killed: true })
    let activeKill: ReturnType<typeof vi.fn> | null = null
    answerAgentBrowserCommands(execFileMock, stdinWrites, (command, cb, _args, child) => {
      if (command.includes('snapshot')) {
        activeKill = child.kill.mockImplementation(() => cb(killedError, '', ''))
        return
      }
      cb(null, JSON.stringify({ success: true, data: null }), '')
    })

    const rejection = expect(bridge.snapshot()).rejects.toMatchObject({
      code: 'browser_tab_closed',
      message: 'Tab was closed while command was running'
    })
    await vi.waitFor(() => expect(activeKill).not.toBeNull())
    await bridge.onPageClosed('tab-1')
    expect(activeKill).toHaveBeenCalledTimes(1)
    await rejection
  })

  it('does not replay stale intercept routes after process swap when the first command disables routing', async () => {
    const tabs = new Map([['tab-1', 100]])
    const mgr = mockBrowserManager(tabs)
    const b = new AgentBrowserBridge(mgr)
    b.setActiveTab(100)

    succeedWith({ ok: true })
    await b.interceptEnable(['https://old.example/**'])

    tabs.set('tab-1', 200)
    webContentsFromIdMock.mockReturnValue(mockWebContents(200))
    succeedWith(null)
    await b.onProcessSwap('tab-1', 200)

    const commandCalls = succeedRecordingAgentBrowserSpawns(execFileMock, stdinWrites, { ok: true })
    await b.interceptDisable()
    expect(
      commandCalls.filter(({ command }) => command[0] === 'network' && command[1] === 'route')
    ).toHaveLength(0)
    const unrouteCall = commandCalls.find(
      ({ command }) => command[0] === 'network' && command[1] === 'unroute'
    )
    expect(unrouteCall).toBeDefined()
    expect(unrouteCall!.cdp).toBe('ws://127.0.0.1:9222')
  })

  // ── destroyAllSessions ──

  it('makes runtime-wide session destruction terminal', async () => {
    succeedWith({ snapshot: 'tree' })
    await bridge.snapshot()

    succeedWith(null)
    await bridge.destroyAllSessions()
    execFileMock.mockClear()

    await expect(bridge.snapshot()).rejects.toMatchObject({
      code: 'browser_owner_unavailable',
      message: 'Browser runtime is shutting down'
    })
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('destroys a session that finishes creating during runtime shutdown', async () => {
    const commandCalls: string[][] = []
    let releaseStaleClose: (() => void) | null = null
    answerAgentBrowserCommands(execFileMock, stdinWrites, (command, cb) => {
      commandCalls.push(command)
      if (command.includes('close') && !releaseStaleClose) {
        releaseStaleClose = () => cb(null, JSON.stringify({ success: true, data: null }), '')
        return
      }
      cb(null, JSON.stringify({ success: true, data: null }), '')
    })

    const ensurePromise = (
      bridge as unknown as {
        ensureSession: (
          sessionName: string,
          browserPageId: string,
          webContentsId: number
        ) => Promise<void>
      }
    ).ensureSession('orca-tab-tab-1', 'tab-1', 100)
    await vi.waitFor(() => expect(releaseStaleClose).not.toBeNull())

    const destroyAllPromise = bridge.destroyAllSessions()
    releaseStaleClose!()
    await ensurePromise
    await destroyAllPromise

    const sessions = (bridge as unknown as { sessions: Map<string, unknown> }).sessions
    const proxy = CdpWsProxyMock.instances[0] as { stop: ReturnType<typeof vi.fn> }
    expect(commandCalls.filter((args) => args.includes('close'))).toHaveLength(2)
    expect(sessions.size).toBe(0)
    expect(proxy.stop).toHaveBeenCalledTimes(1)
  })
})
