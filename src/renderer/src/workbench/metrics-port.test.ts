import { beforeEach, expect, it, vi } from 'vitest'
const call = vi.hoisted(() => vi.fn())
vi.mock('../runtime/runtime-rpc-client', () => ({ callRuntimeRpc: call }))
import { nativeMetricsPort } from './metrics-port'
import { nativeVersionHistoryPort } from './version-history-port'
import type { VersionHistoryCatalog } from '../../../shared/workbench/version-history'

const ref = { name: 'count', definitionHash: 'definition', configurationCommit: 'a'.repeat(40) }
const scope = { repoId: 'repo', worktreeId: 'tree', hostId: 'local' }
beforeEach(() => call.mockReset())

it.each([
  ['local', undefined, { kind: 'local' }, 'local'],
  ['ssh:server', undefined, { kind: 'local' }, 'ssh:server'],
  ['ssh:server', 'paired', { kind: 'environment', environmentId: 'paired' }, 'ssh:server'],
  ['runtime:paired', undefined, { kind: 'environment', environmentId: 'paired' }, 'local']
] as const)(
  'routes metrics on %s through its native owner',
  async (hostId, owner, target, ownerHost) => {
    call.mockResolvedValue({ ok: true, value: { definitions: [], problems: [] } })
    const input = { ...scope, hostId }
    const result = await nativeMetricsPort(owner).list(input)
    expect(call).toHaveBeenCalledWith(
      target,
      'workbench.metrics.list',
      { ...scope, hostId: ownerHost },
      undefined
    )
    expect(result.scope).toEqual(input)
  }
)

it('preserves an unavailable source and previous evidence without turning it into zero', async () => {
  const value = {
    status: 'unknown',
    reason: { code: 'no-history', message: 'Only current values' }
  }
  call.mockResolvedValue({ ok: true, value })
  expect(
    await nativeMetricsPort().read({ scope, ref, window: { kind: 'current', timezone: 'UTC' } })
  ).toEqual(value)
  call.mockResolvedValue({
    ok: false,
    error: { code: 'host-unavailable', message: 'Disconnected' }
  })
  await expect(
    nativeMetricsPort().refresh({ scope, ref, window: { kind: 'current', timezone: 'UTC' } })
  ).rejects.toMatchObject({ code: 'host-unavailable', message: 'Disconnected' })
})

it('normalizes a paired draft source for the owner and returns its caller-visible identity', async () => {
  const planRef = {
    kind: 'draft' as const,
    version: 'v0.5',
    cycleId: 'cycle',
    revision: `sha256:${'a'.repeat(64)}`,
    sourceWorktreeId: 'plan-tree',
    sourceHostId: 'runtime:paired'
  }
  call.mockResolvedValue({
    ok: true,
    value: {
      planRef: { ...planRef, sourceHostId: 'local' },
      revision: planRef.revision,
      source: { kind: 'draft', sourceHostId: 'local', sourceWorktreeId: 'plan-tree' }
    }
  })
  const result = await nativeVersionHistoryPort().readPlan({
    scope: { ...scope, hostId: 'runtime:paired' },
    planRef
  })
  expect(call).toHaveBeenCalledWith(
    { kind: 'environment', environmentId: 'paired' },
    'workbench.history.readPlan',
    {
      scope,
      planRef: { ...planRef, sourceHostId: 'local' }
    },
    undefined
  )
  expect(result.planRef).toEqual(planRef)
  expect(result.source).toMatchObject({ sourceHostId: 'runtime:paired' })
})

it('returns valid history alongside unreadable records through the native owner', async () => {
  const value: VersionHistoryCatalog = {
    records: [
      {
        version: 'v1',
        cycleId: 'cycle',
        sourceCommit: 'a'.repeat(40),
        revision: `sha256:${'b'.repeat(64)}`,
        workflow: 'plan',
        committedAt: '2026-09-24T10:00:00Z'
      }
    ],
    problems: [
      {
        version: 'v0',
        sourceCommit: 'c'.repeat(40),
        workflow: 'acceptance',
        committedAt: '2026-09-17T10:00:00Z',
        code: 'migration-required',
        message: '此记录使用旧版材料格式'
      }
    ]
  }
  call.mockResolvedValue({ ok: true, value })
  const result = await nativeVersionHistoryPort().list({
    scope: { ...scope, hostId: 'runtime:paired' }
  })
  expect(call).toHaveBeenCalledWith(
    { kind: 'environment', environmentId: 'paired' },
    'workbench.history.list',
    { scope },
    undefined
  )
  expect(result).toEqual(value)
})
