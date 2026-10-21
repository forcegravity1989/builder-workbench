import { beforeEach, expect, it, vi } from 'vitest'
const call = vi.hoisted(() => vi.fn())
vi.mock('../runtime/runtime-rpc-client', () => ({ callRuntimeRpc: call }))
import { nativeMetricsPort } from './metrics-port'
import { nativeVersionHistoryPort } from './version-history-port'
import type { VersionHistoryCatalog } from '../../../shared/workbench/version-history'

const ref = { name: 'count', definitionHash: 'definition', configurationCommit: 'a'.repeat(40) }
const scope = { repoId: 'repo', worktreeId: 'tree', hostId: 'local' }
beforeEach(() => call.mockReset())

// G2 P4 ratchet 对冲（环 4 负面清单·装配例）：owner 路由矩阵与
// version-material-port.test.ts 的 it.each 看护同一份共享实现
// （metricRuntimeRoute/routeForOwner），此处重复装配覆盖删除，
// 路由看护保留在 version-material-port 单一套件；诚实性推导例全保留。

it('preserves an unavailable source and previous evidence without turning it into zero', async () => {
  const value = {
    status: 'unknown',
    reason: { code: 'no-history', message: 'Only current values' }
  }
  call.mockResolvedValue({ ok: true, value })
  expect(
    await nativeMetricsPort().read({
      scope,
      ref,
      window: {
        kind: 'range',
        since: '2026-09-01',
        until: '2026-09-02',
        granularity: 'day',
        timezone: 'UTC'
      }
    })
  ).toEqual(value)
  call.mockResolvedValue({
    ok: false,
    error: { code: 'host-unavailable', message: 'Disconnected' }
  })
  await expect(
    nativeMetricsPort().refresh({
      scope,
      ref,
      window: {
        kind: 'range',
        since: '2026-09-01',
        until: '2026-09-02',
        granularity: 'day',
        timezone: 'UTC'
      }
    })
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
