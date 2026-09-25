import { beforeEach, expect, it, vi } from 'vitest'
import type { Worktree } from '../../../../shared/worktree/types'

const test = vi.hoisted(() => ({ state: {} as Record<string, unknown>, rpc: vi.fn() }))
vi.mock('@/store', () => ({ useAppStore: { getState: () => test.state } }))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: test.rpc }))
import { ensureNamedWorktree, findNamedWorktree, nativeWorkspaceScope } from './native-workspace'

const row = (hostId: Worktree['hostId'], runtimeOwnerEnvironmentId?: string) =>
  ({
    id: 'repo::/same/path',
    repoId: 'repo',
    projectId: 'project',
    path: '/same/path',
    branch: 'bw/week-plan',
    hostId,
    runtimeOwnerEnvironmentId
  }) as Worktree

beforeEach(() => {
  test.rpc.mockReset()
})

it('keeps equal path ids on different hosts distinct regardless of active focus', () => {
  const a = row('ssh:a', 'transport-a')
  const b = row('ssh:b', 'transport-b')
  test.state = {
    repos: [],
    allWorktrees: () => [a, b],
    activeWorktreeId: a.id,
    activeWorkspaceExecutionHostId: 'ssh:a'
  }
  const scope = nativeWorkspaceScope(b)
  expect(scope).toMatchObject({ hostId: 'ssh:b', runtimeOwnerEnvironmentId: 'transport-b' })
  expect(findNamedWorktree(scope, 'bw/week-plan')).toBe(b)
})

it.each(['runtime:b', 'ssh:nested'] as const)(
  'refreshes creation through the captured runtime for %s after focus changes',
  async (hostId) => {
    const created = row(hostId, 'b')
    const rows: Worktree[] = []
    const fetchWorktrees = vi.fn(async () => {
      rows.push(created)
      return true
    })
    test.state = { repos: [], allWorktrees: () => rows, fetchWorktrees }
    test.rpc.mockImplementation(async () => {
      test.state.activeWorkspaceExecutionHostId = 'runtime:a'
      return { worktree: created }
    })
    const scope = {
      projectId: 'project',
      repoId: 'repo',
      hostId,
      runtimeOwnerEnvironmentId: 'b'
    }
    await expect(ensureNamedWorktree(scope, 'bw/week-plan', 'week-plan')).resolves.toBe(created)
    expect(test.rpc).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'b' },
      'worktree.create',
      expect.objectContaining({ repo: 'id:repo', branchNameOverride: 'bw/week-plan' }),
      expect.anything()
    )
    expect(fetchWorktrees).toHaveBeenCalledWith('repo', { executionHostId: 'runtime:b' })
  }
)
