// @vitest-environment happy-dom
// Why happy-dom: start-cycle-automation polls via window.setTimeout; cases below
// drive the real runNow protocol against fake timers and need the window global.
import { beforeEach, expect, it, vi } from 'vitest'
import type { Automation } from '../../../../shared/automations-types'
import type { ProjectHostSetup } from '../../../../shared/project-types'
import type { Repo } from '../../../../shared/repo-types'
import type { CycleScope } from './ports'

const test = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  rpc: vi.fn(),
  openRun: vi.fn()
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => test.state } }))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: test.rpc,
  getRuntimeEnvironmentStatus: vi.fn()
}))
vi.mock('./cycle-prompt', () => ({ buildCyclePrompt: vi.fn(async () => 'CYCLE-PROMPT') }))
vi.mock('./current-cycle-workspace', () => ({ assertCurrentCycleWorkspace: vi.fn() }))
vi.mock('@/components/automations/automation-run-workspace-action', () => ({
  openAutomationRunTerminal: test.openRun
}))
import { cycleAutomationCreationKey, ensureCycleAutomation } from './ensure-cycle-automation'
import { startCycleAutomation } from './start-cycle-automation'

const scope: CycleScope = {
  projectId: 'project',
  repoId: 'repo',
  hostId: 'local',
  workflow: 'plan'
}
const FIXED_ID = 'wt-fixed'
const KEY = cycleAutomationCreationKey(scope)
const repoRow = { id: 'repo', path: '/repo' } as Repo
const readySetup = {
  id: 'setup-1',
  projectId: 'project',
  repoId: 'repo',
  hostId: 'local',
  path: '/repo',
  setupState: 'ready'
} as ProjectHostSetup

function setState(overrides: Record<string, unknown> = {}): void {
  test.state = {
    repos: [repoRow],
    projectHostSetups: [readySetup],
    runtimeEnvironments: [],
    sshTargetGenerations: new Map<string, number>(),
    ...overrides
  }
}

function rpcWith(automations: unknown[]): void {
  test.rpc.mockImplementation(async (_target: unknown, method: string) => {
    if (method === 'automation.list') {
      return { automations }
    }
    if (method === 'automation.create') {
      return { automation: { id: 'auto-new' } }
    }
    if (method === 'automation.update') {
      return { automation: { id: 'a1' } }
    }
    throw new Error(`unexpected ${method}`)
  })
}

function createCalls(): Record<string, unknown>[] {
  return test.rpc.mock.calls
    .filter((call: unknown[]) => call[1] === 'automation.create')
    .map((call: unknown[]) => call[2] as Record<string, unknown>)
}

function updateCalls(): Record<string, unknown>[] {
  return test.rpc.mock.calls
    .filter((call: unknown[]) => call[1] === 'automation.update')
    .map((call: unknown[]) => call[2] as Record<string, unknown>)
}

beforeEach(() => {
  test.rpc.mockReset()
  setState()
})

it('identity key embeds the cycle scope and workflow', () => {
  expect(KEY).toBe(`bw-cycle:${JSON.stringify(['project', 'repo', 'local', '', 'plan'])}:plan`)
})

it('refreshes a stale BW-owned prompt in place and never recreates the entry', async () => {
  rpcWith([
    {
      id: 'a1',
      creationKey: KEY,
      name: '被人改过名',
      prompt: '旧版 BW 提示',
      workspaceId: null
    } as Automation
  ])
  await expect(ensureCycleAutomation(scope, FIXED_ID, 'claude')).resolves.toEqual({
    status: 'exists',
    automationId: 'a1'
  })
  expect(createCalls()).toHaveLength(0)
  const [params] = updateCalls()
  expect(params).toMatchObject({ id: 'a1' })
  // 覆盖同步只动 BW 所有的提示词，人所有的字段（名字、开关、时间、模型）不出现在更新里。
  expect(params.updates).toEqual({ prompt: 'CYCLE-PROMPT' })
})

it('keeps an up-to-date entry untouched', async () => {
  rpcWith([
    {
      id: 'a1',
      creationKey: KEY,
      name: '被人改过名',
      prompt: 'CYCLE-PROMPT',
      workspaceId: null
    } as Automation
  ])
  await expect(ensureCycleAutomation(scope, FIXED_ID, 'claude')).resolves.toEqual({
    status: 'exists',
    automationId: 'a1'
  })
  expect(createCalls()).toHaveLength(0)
  expect(updateCalls()).toHaveLength(0)
})

it('reports a failed prompt sync without blocking the registered entry', async () => {
  test.rpc.mockImplementation(async (_target: unknown, method: string) => {
    if (method === 'automation.list') {
      return { automations: [{ id: 'a1', creationKey: KEY, prompt: '旧版', workspaceId: null }] }
    }
    if (method === 'automation.update') {
      throw new Error('宿主拒绝了更新')
    }
    throw new Error(`unexpected ${method}`)
  })
  const result = await ensureCycleAutomation(scope, FIXED_ID, 'claude')
  expect(result).toMatchObject({ status: 'exists', automationId: 'a1' })
  expect((result as { syncError?: string }).syncError).toContain('宿主拒绝了更新')
})

it('falls back to the same-name entry on the same fixed tree, not another tree', async () => {
  rpcWith([
    { id: 'elsewhere', name: '每周版本计划', workspaceId: 'another-tree' },
    { id: 'a2', name: '每周版本计划', prompt: 'CYCLE-PROMPT', workspaceId: FIXED_ID }
  ] as unknown as Automation[])
  await expect(ensureCycleAutomation(scope, FIXED_ID, 'claude')).resolves.toEqual({
    status: 'exists',
    automationId: 'a2'
  })
  expect(createCalls()).toHaveLength(0)
})

it.each([
  ['plan', '每周版本计划（BW）', 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0'],
  ['acceptance', '每周版本验收（BW）', 'FREQ=WEEKLY;BYDAY=FR;BYHOUR=16;BYMINUTE=0']
] as const)('creates the %s automation disabled by default', async (workflow, name, rrule) => {
  rpcWith([])
  const before = Date.now()
  const workflowScope: CycleScope = { ...scope, workflow }
  await expect(ensureCycleAutomation(workflowScope, FIXED_ID, 'claude')).resolves.toEqual({
    status: 'created',
    automationId: 'auto-new'
  })
  const [params] = createCalls()
  expect(params).toMatchObject({
    creationKey: cycleAutomationCreationKey(workflowScope),
    name,
    prompt: 'CYCLE-PROMPT',
    precheck: null,
    agentId: 'claude',
    repo: 'id:repo',
    workspace: `id:${FIXED_ID}`,
    workspaceMode: 'existing',
    reuseSession: false,
    rrule,
    enabled: false,
    destination: { selector: { kind: 'self' } }
  })
  expect(params.runContext).toMatchObject({
    kind: 'workspace-run',
    projectId: 'project',
    repoId: 'repo',
    projectHostSetupId: 'setup-1'
  })
  expect(params.timezone).toBeTruthy()
  // dtstart 是下一次触发时刻：严格晚于创建时刻。
  expect(params.dtstart).toBeGreaterThan(before)
  // sourceContext 在 schema 上可选，周期自动化不传。
  expect(params).not.toHaveProperty('sourceContext')
})

it('does not create when a precondition is missing, and says which one', async () => {
  // 同一守卫链的两个前置分支：宿主 setup 未就绪 / 会话工具未检测到。
  setState({ projectHostSetups: [] })
  rpcWith([])
  const noSetup = await ensureCycleAutomation(scope, FIXED_ID, 'claude')
  expect(noSetup.status).toBe('skipped')
  expect((noSetup as { reason: string }).reason).toContain('宿主 setup 未就绪')

  setState()
  const noAgent = await ensureCycleAutomation(scope, FIXED_ID, null)
  expect(noAgent.status).toBe('skipped')
  expect((noAgent as { reason: string }).reason).toContain('会话工具')
  expect(createCalls()).toHaveLength(0)
})

it('creates once when concurrent callers share one identity', async () => {
  rpcWith([])
  const [first, second] = await Promise.all([
    ensureCycleAutomation(scope, FIXED_ID, 'claude'),
    ensureCycleAutomation(scope, FIXED_ID, 'claude')
  ])
  expect(first).toEqual({ status: 'created', automationId: 'auto-new' })
  expect(second).toEqual(first)
  expect(createCalls()).toHaveLength(1)
})

it('runs the saved automation with its SSH owner and opens only the matching run when ready', async () => {
  vi.useFakeTimers()
  setState({ sshTargetGenerations: new Map([['server', 7]]) })
  const automation = { id: 'a1', workspaceMode: 'existing', workspaceId: FIXED_ID }
  const pending = { id: 'run-1', automationId: 'a1', status: 'pending', workspaceId: FIXED_ID }
  const ready = { ...pending, status: 'dispatched', terminalPaneKey: 'pane', terminalPtyId: 'pty' }
  test.openRun.mockImplementation((run) => run === ready)
  test.rpc.mockImplementation(async (_target, method) => {
    if (method === 'automation.list') {
      return {
        automations: [automation],
        items: [
          {
            automationId: 'a1',
            selector: { kind: 'ssh', targetId: 'server', targetGeneration: 7 }
          }
        ]
      }
    }
    if (method === 'automation.runNow') {
      return { run: pending }
    }
    if (method === 'automation.runs') {
      return { runs: [{ ...ready, id: 'unrelated-run' }, ready] }
    }
    throw new Error(`unexpected ${method}`)
  })
  try {
    const running = startCycleAutomation({ ...scope, hostId: 'ssh:server' }, FIXED_ID, 'a1')
    await vi.advanceTimersByTimeAsync(1000)
    await running
    expect(test.rpc).toHaveBeenCalledWith(
      { kind: 'local' },
      'automation.runNow',
      {
        id: 'a1',
        expectedOwner: { selector: { kind: 'ssh', targetId: 'server', targetGeneration: 7 } }
      },
      expect.anything()
    )
    expect(test.openRun).toHaveBeenLastCalledWith(ready, 'ssh:server')
    expect(test.rpc.mock.calls.filter((call) => call[1] === 'automation.runNow')).toHaveLength(1)
  } finally {
    vi.useRealTimers()
  }
})

it('forwards one-shot context into the saved automation run params', async () => {
  setState({ sshTargetGenerations: new Map([['server', 7]]) })
  const automation = { id: 'a1', workspaceMode: 'existing', workspaceId: FIXED_ID }
  const ready = {
    id: 'run-1',
    automationId: 'a1',
    status: 'dispatched',
    workspaceId: FIXED_ID,
    terminalPaneKey: 'pane',
    terminalPtyId: 'pty'
  }
  test.openRun.mockImplementation((run) => run === ready)
  test.rpc.mockImplementation(async (_target, method) => {
    if (method === 'automation.list') {
      return {
        automations: [automation],
        items: [
          {
            automationId: 'a1',
            selector: { kind: 'ssh', targetId: 'server', targetGeneration: 7 }
          }
        ]
      }
    }
    if (method === 'automation.runNow') {
      return { run: ready }
    }
    throw new Error(`unexpected ${method}`)
  })
  await startCycleAutomation(
    { ...scope, hostId: 'ssh:server' },
    FIXED_ID,
    'a1',
    '本次处理请求：修复 v0.3 数据文件'
  )
  const runNowCall = test.rpc.mock.calls.find((call) => call[1] === 'automation.runNow')
  expect(runNowCall?.[2]).toMatchObject({
    id: 'a1',
    oneShotPrompt: '本次处理请求：修复 v0.3 数据文件'
  })
})
