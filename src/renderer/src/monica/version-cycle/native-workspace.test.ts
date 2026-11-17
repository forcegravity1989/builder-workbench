import { beforeEach, expect, it, vi } from 'vitest'
import type { Worktree } from '../../../../shared/worktree/types'
import { getWorktreeHostIdentity } from '../../../../shared/worktree/host-qualified-identity'
import { toRuntimeExecutionHostId } from '../../../../shared/execution-host'

const test = vi.hoisted(() => ({ state: {} as Record<string, unknown>, rpc: vi.fn() }))
vi.mock('@/store', () => ({ useAppStore: { getState: () => test.state } }))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: test.rpc,
  assertRuntimeEnvironmentCapability: vi.fn()
}))
vi.mock('@/lib/worktree-activation', () => ({ activateAndRevealWorktree: vi.fn() }))
vi.mock('../project-page-state', () => ({ closeProjectPage: vi.fn() }))
import { ensureNamedWorktree, findNamedWorktree, nativeWorkspaceScope } from './native-workspace'
import { cycleRuntimeTarget, cycleScopeForWorktree } from './native-cycle-workspace'
import { isVersionHostDisconnected } from '../version-worktree-host'

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

it('keeps fixed-workspace owner identity regardless of active focus and refresh outcome', async () => {
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

  const owners = [
    { label: 'local', hostId: 'local', ownerHostId: 'local' },
    { label: 'direct SSH', hostId: 'ssh:b', ownerHostId: 'ssh:b' },
    {
      label: 'paired local',
      hostId: 'runtime:transport-b',
      ownerHostId: 'local',
      runtimeOwnerEnvironmentId: 'transport-b'
    },
    {
      label: 'paired local host-only',
      hostId: 'runtime:transport-b',
      ownerHostId: 'local',
      inferredRuntimeOwnerEnvironmentId: 'transport-b'
    },
    {
      label: 'paired SSH',
      hostId: 'ssh:b',
      ownerHostId: 'ssh:b',
      runtimeOwnerEnvironmentId: 'transport-b'
    }
  ] as const
  for (const owner of owners) {
    const runtimeOwnerEnvironmentId =
      'runtimeOwnerEnvironmentId' in owner
        ? owner.runtimeOwnerEnvironmentId
        : 'inferredRuntimeOwnerEnvironmentId' in owner
          ? owner.inferredRuntimeOwnerEnvironmentId
          : undefined
    const refreshHost = runtimeOwnerEnvironmentId
      ? toRuntimeExecutionHostId(runtimeOwnerEnvironmentId)
      : owner.hostId
    for (const workflow of ['plan', 'acceptance'] as const) {
      const branch = workflow === 'plan' ? 'bw/week-plan' : 'bw/week-acceptance'
      const name = workflow === 'plan' ? 'week-plan' : 'week-acceptance'
      for (const refreshFails of [false, true]) {
        const label = `${owner.label}/${workflow}/refresh ${refreshFails ? 'failed' : 'succeeded'}`
        const raw = { ...row(owner.ownerHostId), branch }
        const projected = { ...raw, hostId: owner.hostId, runtimeOwnerEnvironmentId }
        const requested = {
          projectId: 'project',
          repoId: 'repo',
          hostId: owner.hostId,
          runtimeOwnerEnvironmentId:
            'runtimeOwnerEnvironmentId' in owner ? owner.runtimeOwnerEnvironmentId : undefined
        }
        const active = { ...a, branch }
        let rows = [active]
        const fetchWorktrees = vi.fn(async () => {
          if (refreshFails) {
            throw new Error('Catalog refresh unavailable')
          }
          rows = [active, projected]
        })
        test.state = {
          repos: [
            { id: 'repo', executionHostId: 'runtime:transport-a', connectionId: 'a' },
            {
              id: 'repo',
              executionHostId: refreshHost,
              ...(owner.ownerHostId === 'ssh:b' ? { connectionId: 'b' } : {})
            }
          ],
          allWorktrees: () => rows,
          activeWorktreeId: active.id,
          activeWorkspaceExecutionHostId: active.hostId,
          fetchWorktrees
        }
        test.rpc.mockReset().mockResolvedValue({
          ok: true,
          value: { state: 'created', worktree: raw }
        })

        const fixed = await ensureNamedWorktree(requested, branch, name)
        const fixedScope = cycleScopeForWorktree(fixed, workflow)
        expect.soft(getWorktreeHostIdentity(fixed), label).toBe(`${owner.hostId}|${raw.id}`)
        expect.soft(fixed.runtimeOwnerEnvironmentId, label).toBe(runtimeOwnerEnvironmentId)
        expect
          .soft(fixedScope, label)
          .toEqual({ ...requested, runtimeOwnerEnvironmentId, workflow })
        expect
          .soft(cycleRuntimeTarget(fixedScope), label)
          .toEqual(
            runtimeOwnerEnvironmentId
              ? { kind: 'environment', environmentId: runtimeOwnerEnvironmentId }
              : { kind: 'local' }
          )
        // The legacy entry passes this host directly to setActiveWorktree.
        expect.soft(fixedScope.hostId, label).toBe(owner.hostId)
        expect.soft(fetchWorktrees, label).toHaveBeenCalledWith('repo', {
          executionHostId: refreshHost
        })
        expect.soft(test.rpc, label).toHaveBeenCalledWith(
          runtimeOwnerEnvironmentId
            ? { kind: 'environment', environmentId: runtimeOwnerEnvironmentId }
            : { kind: 'local' },
          'workbench.fixedWorkspace.ensure',
          {
            repoId: 'repo',
            hostId: owner.ownerHostId,
            kind: workflow,
            setupDecision: 'inherit'
          },
          { timeoutMs: 600000 }
        )
      }
    }
  }

  const paired = { id: 'repo', executionHostId: 'runtime:peer' }
  test.state = {
    repos: [paired, { id: 'repo', executionHostId: 'local' }],
    runtimeStatusByEnvironmentId: new Map([['peer', { status: null }]])
  }

  expect(isVersionHostDisconnected(row('local'))).toBe(false)
  expect(isVersionHostDisconnected(row('ssh:direct'))).toBe(false)
  expect(isVersionHostDisconnected(row('ssh:nested', 'peer'))).toBe(true)
  expect(isVersionHostDisconnected(row('runtime:peer'))).toBe(true)
  expect(isVersionHostDisconnected(row(undefined))).toBe(false)

  test.state.repos = [paired]
  expect(isVersionHostDisconnected(row(undefined))).toBe(true)
})
