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
  createSucceedWith,
  mockBrowserManager,
  mockWebContents,
  overrideBridgeWebContentsLookup,
  resetAgentBrowserBridgeMocks,
  type ExecFileCallback
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
    execFileMock.mockImplementation(
      (_bin: string, args: string[], _opts: unknown, cb: ExecFileCallback) => {
        commandCalls.push(args)
        if (args.includes('close')) {
          if (!releaseDestroyClose) {
            releaseDestroyClose = () => {
              cb(null, JSON.stringify({ success: true, data: null }), '')
            }
            return
          }
          cb(null, JSON.stringify({ success: true, data: null }), '')
          return
        }
        if (args.includes('snapshot')) {
          cb(null, JSON.stringify({ success: true, data: { snapshot: 'after-destroy' } }), '')
          return
        }
        cb(null, JSON.stringify({ success: true, data: { ok: true } }), '')
      }
    )

    const destroyPromise = (
      bridge as unknown as { destroySession: (name: string) => Promise<void> }
    ).destroySession('orca-tab-tab-1')
    const nextSnapshot = bridge.snapshot()

    await Promise.resolve()
    await Promise.resolve()

    expect(commandCalls.filter((args) => args.includes('close'))).toHaveLength(1)
    expect(commandCalls.some((args) => args.includes('snapshot'))).toBe(false)
    expect(releaseDestroyClose).not.toBeNull()

    releaseDestroyClose!()
    await destroyPromise
    await expect(nextSnapshot).resolves.toEqual({
      browserPageId: 'tab-1',
      snapshot: 'after-destroy'
    })
    expect(commandCalls.filter((args) => args.includes('close'))).toHaveLength(2)
  })

  it('cancels the command already running when a session is destroyed', async () => {
    succeedWith({ snapshot: 'initial' })
    await bridge.snapshot()

    execFileMock.mockClear()

    const killedError = Object.assign(new Error('killed'), { killed: true })
    let resolveRunningCommand: (() => void) | null = null
    const activeChild = {
      kill: vi.fn(() => {
        resolveRunningCommand?.()
      })
    }

    execFileMock.mockImplementation(
      (_bin: string, args: string[], _opts: unknown, cb: ExecFileCallback) => {
        if (args.includes('snapshot')) {
          resolveRunningCommand = () => cb(killedError, '', '')
          return activeChild
        }
        if (args.includes('close')) {
          cb(null, JSON.stringify({ success: true, data: null }), '')
          return { kill: vi.fn() }
        }
        cb(null, JSON.stringify({ success: true, data: { ok: true } }), '')
        return { kill: vi.fn() }
      }
    )

    const runningSnapshot = bridge.snapshot()
    await vi.waitFor(() => {
      expect(resolveRunningCommand).not.toBeNull()
    })

    const destroyPromise = (
      bridge as unknown as { destroySession: (name: string) => Promise<void> }
    ).destroySession('orca-tab-tab-1')

    expect(activeChild.kill).toHaveBeenCalledTimes(1)
    await expect(runningSnapshot).rejects.toMatchObject({
      code: 'browser_tab_closed',
      message: 'Tab was closed while command was running'
    })
    await destroyPromise
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

    const commandCalls: string[][] = []
    execFileMock.mockImplementation(
      (_bin: string, args: string[], _opts: unknown, cb: ExecFileCallback) => {
        commandCalls.push(args)
        cb(null, JSON.stringify({ success: true, data: { ok: true } }), '')
      }
    )

    await b.interceptDisable()

    const routeCalls = commandCalls.filter(
      (args) => args.includes('network') && args.includes('route')
    )
    expect(routeCalls).toHaveLength(0)

    const unrouteCall = commandCalls.find(
      (args) => args.includes('network') && args.includes('unroute')
    )
    expect(unrouteCall).toBeDefined()
    expect(unrouteCall).toContain('--cdp')
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
    execFileMock.mockImplementation(
      (_bin: string, args: string[], _opts: unknown, cb: ExecFileCallback) => {
        commandCalls.push(args)
        if (args.includes('close') && !releaseStaleClose) {
          releaseStaleClose = () => {
            cb(null, JSON.stringify({ success: true, data: null }), '')
          }
          return { kill: vi.fn() }
        }
        cb(null, JSON.stringify({ success: true, data: null }), '')
        return { kill: vi.fn() }
      }
    )

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
