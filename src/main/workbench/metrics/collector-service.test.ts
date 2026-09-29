import { expect, it, vi } from 'vitest'
import type { MetricDefinition, MetricReadRequest } from '../../../shared/workbench/metrics'
import { createMetricsService, type MetricCollectorContext } from './collector-service'

const definition: MetricDefinition = {
  ref: { name: 'count', definitionHash: 'hash', configurationCommit: 'a'.repeat(40) },
  role: 'lagging',
  name: 'count',
  def: 'count from source',
  target: '',
  unit: '个',
  feature: '',
  collect: { kind: 'script', run: ['python', 'collect.py'], retro: true }
}
const request: MetricReadRequest = {
  scope: { repoId: 'repo', worktreeId: 'plan-tree', hostId: 'local' },
  ref: definition.ref,
  window: {
    kind: 'range',
    since: '2026-09-01',
    until: '2026-09-02',
    granularity: 'day',
    timezone: 'UTC'
  }
}
const context = (run: MetricCollectorContext['run']): MetricCollectorContext => ({
  definition,
  collectorRevision: 'collector',
  source: 'repo/service',
  dataTarget: { repository: 'repo', commit: 'b'.repeat(40), hostId: 'local' },
  run
})
const unusedCatalog = async () => {
  throw new Error('catalog not called')
}

it('deduplicates the same source across plan and acceptance worktrees', async () => {
  let finish!: (value: { stdout: string }) => void
  const run = vi.fn(
    () =>
      new Promise<{ stdout: string }>((resolve) => {
        finish = resolve
      })
  )
  const service = createMetricsService({
    catalog: unusedCatalog,
    prepare: async () => context(run)
  })
  const plan = service.refresh(request)
  const acceptance = service.refresh({
    ...request,
    scope: { ...request.scope, worktreeId: 'acceptance-tree' }
  })
  await vi.waitFor(() => expect(run).toHaveBeenCalledOnce())
  finish({ stdout: '{"points":[{"day":"2026-09-01","value":0}]}' })
  const [first, second] = await Promise.all([plan, acceptance])
  expect(first).toEqual(second)
  expect(first).toMatchObject({ status: 'ready', readings: [{ value: 0 }] })
  expect(await service.read(request)).toEqual(first)
})

it('preserves the original evidence time on execution and preparation failures', async () => {
  let now = '2026-09-20T10:00:00Z'
  let unavailable = false
  const run = vi
    .fn()
    .mockResolvedValueOnce({ stdout: '{"points":[{"day":"2026-09-01","value":0}]}' })
    .mockRejectedValue(new Error('timed out'))
  const service = createMetricsService(
    {
      catalog: unusedCatalog,
      async prepare() {
        if (unavailable) {
          throw new Error('host disconnected')
        }
        return context(run)
      }
    },
    () => now
  )
  await service.refresh(request)
  now = '2026-09-20T11:00:00Z'
  expect(await service.refresh(request)).toMatchObject({
    status: 'error',
    previous: { readings: [{ value: 0, collectedAt: '2026-09-20T10:00:00Z' }] }
  })
  unavailable = true
  expect(await service.refresh(request)).toMatchObject({
    status: 'error',
    reason: { message: 'host disconnected' },
    previous: { readings: [{ collectedAt: '2026-09-20T10:00:00Z' }] }
  })
})

it('does not reuse a result when script revision or data target changes', async () => {
  let current = context(async () => ({ stdout: '{"points":[{"day":"2026-09-01","value":1}]}' }))
  const service = createMetricsService({ catalog: unusedCatalog, prepare: async () => current })
  await service.refresh(request)
  current = { ...current, collectorRevision: 'new-script' }
  expect(await service.read(request)).toMatchObject({ status: 'unknown' })
  await service.refresh(request)
  current = { ...current, dataTarget: { ...current.dataTarget, commit: 'c'.repeat(40) } }
  expect(await service.read(request)).toMatchObject({ status: 'unknown' })
})

it('does not let a late old run replace the latest evidence used after a disconnect', async () => {
  let finish!: (value: { stdout: string }) => void
  let current = context(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  let unavailable = false
  const service = createMetricsService({
    catalog: unusedCatalog,
    async prepare() {
      if (unavailable) {
        throw new Error('disconnected')
      }
      return current
    }
  })
  const old = service.refresh(request)
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  current = {
    ...current,
    collectorRevision: 'new-script',
    run: async () => ({ stdout: '{"points":[{"day":"2026-09-01","value":2}]}' })
  }
  await service.refresh(request)
  finish({ stdout: '{"points":[{"day":"2026-09-01","value":1}]}' })
  await old
  unavailable = true
  expect(await service.read(request)).toMatchObject({
    status: 'error',
    previous: { readings: [{ value: 2 }] }
  })
})
