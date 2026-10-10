// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest'
import type { ProjectHostSetup } from '../../../../shared/project-types'
import type { Repo } from '../../../../shared/repo-types'
import type { CycleScope } from './ports'

const test = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  rpc: vi.fn()
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => test.state } }))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: test.rpc,
  getRuntimeEnvironmentStatus: vi.fn()
}))
// Why: ensure-cycle-automation (reused for host pinning) imports the cycle prompt
// chain; the composer prompt itself comes from the real bundled SKILL.md below.
vi.mock('./cycle-prompt', () => ({ buildCyclePrompt: vi.fn(async () => 'CYCLE-PROMPT') }))
import { ensureComposerAutomation } from './ensure-composer-automation'

const scope: CycleScope = {
  projectId: 'project',
  repoId: 'repo',
  hostId: 'local',
  workflow: 'plan'
}
const FIXED_ID = 'wt-fixed'
const repoRow = { id: 'repo', path: '/repo' } as Repo
const readySetup = {
  id: 'setup-1',
  projectId: 'project',
  repoId: 'repo',
  hostId: 'local',
  path: '/repo',
  setupState: 'ready'
} as ProjectHostSetup

function setState(): void {
  test.state = {
    repos: [repoRow],
    projectHostSetups: [readySetup],
    runtimeEnvironments: [],
    sshTargetGenerations: new Map<string, number>()
  }
}

beforeEach(() => {
  test.rpc.mockReset()
  setState()
})

it('creates the composer automation disabled, keyed per project, with the bundled skill prompt', async () => {
  test.rpc.mockImplementation(async (_target: unknown, method: string) => {
    if (method === 'automation.list') {
      return { automations: [] }
    }
    if (method === 'automation.create') {
      return { automation: { id: 'auto-new' } }
    }
    throw new Error(`unexpected ${method}`)
  })
  const before = Date.now()
  await expect(ensureComposerAutomation(scope, FIXED_ID, 'claude')).resolves.toEqual({
    status: 'created',
    automationId: 'auto-new'
  })
  const [params] = test.rpc.mock.calls
    .filter((call: unknown[]) => call[1] === 'automation.create')
    .map((call: unknown[]) => call[2] as Record<string, unknown>)
  expect(params).toMatchObject({
    // 身份钉项目+仓库+宿主，不含 workflow：composer 是项目级入口，两屏共用一条。
    creationKey: `bw-composer:${JSON.stringify(['project', 'repo', 'local', ''])}`,
    name: 'AI 创建自动化（BW）',
    prompt: expect.stringContaining('自动化作曲'),
    precheck: null,
    agentId: 'claude',
    repo: 'id:repo',
    workspace: `id:${FIXED_ID}`,
    workspaceMode: 'existing',
    reuseSession: false,
    // 占位调度：schema 要求非空 rrule；enabled:false 禁用定时，仅手动 runNow。
    rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0',
    enabled: false,
    destination: { selector: { kind: 'self' } }
  })
  expect(params.timezone).toBeTruthy()
  expect(params.dtstart).toBeGreaterThan(before)
})
