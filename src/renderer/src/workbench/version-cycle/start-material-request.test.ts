import { beforeEach, expect, it, vi } from 'vitest'
import type { CycleScope } from './ports'
const mocks = vi.hoisted(() => ({
  state: {
    activeView: 'terminal',
    activeWorktreeId: 'wt',
    getKnownWorktreeById: () => ({ hostId: 'local' })
  },
  prompt: vi.fn(async () => 'SYSTEM + Skill'),
  launch: vi.fn()
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('@/lib/launch-agent-in-new-tab', () => ({ launchAgentInNewTab: mocks.launch }))
vi.mock('./cycle-prompt', () => ({ buildCyclePrompt: mocks.prompt }))
vi.mock('./native-cycle-workspace', () => ({
  cycleScopeForWorktree: (tree: { hostId: string }, workflow: string) => ({
    projectId: 'p',
    repoId: 'r',
    hostId: tree.hostId,
    workflow
  }),
  cycleScopeKey: (scope: CycleScope) =>
    JSON.stringify([scope.projectId, scope.repoId, scope.hostId, scope.workflow])
}))
import { startMaterialRequest } from './start-material-request'
const scope: CycleScope = { projectId: 'p', repoId: 'r', hostId: 'local', workflow: 'plan' }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.activeWorktreeId = 'wt'
  mocks.state.getKnownWorktreeById = () => ({ hostId: 'local' })
  mocks.prompt.mockResolvedValue('SYSTEM + Skill')
  mocks.launch.mockReturnValue({ promptDeliveryResult: Promise.resolve({ delivered: true }) })
})
it('creates a native session and submits only after readiness, including an empty workspace', async () => {
  await startMaterialRequest(scope, 'wt', 'claude', 'v0.3/data.json 格式有问题')
  expect(mocks.launch).toHaveBeenCalledWith(
    expect.objectContaining({
      worktreeId: 'wt',
      activate: true,
      promptDelivery: 'submit-after-ready',
      prompt: 'SYSTEM + Skill\n\n本次处理请求：\nv0.3/data.json 格式有问题'
    })
  )
})
it('does not launch after a workspace switch during prompt preparation', async () => {
  mocks.prompt.mockImplementationOnce(async () => {
    mocks.state.activeWorktreeId = 'other'
    return 'prompt'
  })
  await expect(startMaterialRequest(scope, 'wt', 'claude', 'repair')).rejects.toThrow(
    '工作区已切换'
  )
  expect(mocks.launch).not.toHaveBeenCalled()
})
it('does not launch into a same-id workspace on a different host', async () => {
  mocks.state.getKnownWorktreeById = () => ({ hostId: 'ssh:other' })
  await expect(startMaterialRequest(scope, 'wt', 'claude', 'repair')).rejects.toThrow(
    '工作区已切换'
  )
  expect(mocks.launch).not.toHaveBeenCalled()
})
it('surfaces a structured launch failure instead of claiming the request was sent', async () => {
  mocks.launch.mockReturnValue({
    structuredSettlement: Promise.resolve({
      kind: 'failed',
      error: new Error('provider unavailable')
    })
  })
  await expect(startMaterialRequest(scope, 'wt', 'claude', 'repair')).rejects.toThrow(
    'provider unavailable'
  )
})
it('waits for the native structured prompt receipt', async () => {
  mocks.launch.mockReturnValue({
    structuredSettlement: Promise.resolve({
      kind: 'structured',
      sessionId: 's',
      promptDeliveryResult: Promise.resolve({ delivered: false })
    })
  })
  await expect(startMaterialRequest(scope, 'wt', 'claude', 'repair')).rejects.toThrow(
    '尚未确认发送'
  )
})
it('accepts a delivered runtime request without introducing local tabs', async () => {
  mocks.launch.mockReturnValue({ runtimeLaunch: Promise.resolve({ delivered: true }) })
  await expect(startMaterialRequest(scope, 'wt', 'claude', 'repair')).resolves.toBeUndefined()
})
