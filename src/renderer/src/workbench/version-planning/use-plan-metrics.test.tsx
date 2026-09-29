// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  metricRefKey,
  type MetricCatalog,
  type MetricDefinition,
  type MetricReading,
  type MetricRef,
  type MetricsPort
} from '../../../../shared/workbench/metrics'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'

const fixture = vi.hoisted(() => ({
  port: {
    list: vi.fn<MetricsPort['list']>(),
    read: vi.fn<MetricsPort['read']>(),
    refresh: vi.fn<MetricsPort['refresh']>()
  }
}))
vi.mock('../metrics-port', () => ({ nativeMetricsPort: () => fixture.port }))
import { usePlanMetrics } from './use-plan-metrics'

const scope = { repoId: 'repo', worktreeId: 'plan-tree', hostId: 'local' }
const ref = (revision: string, name = '交付数'): MetricRef => ({
  name,
  definitionHash: `sha256:${revision.repeat(64)}`,
  configurationCommit: revision.repeat(40)
})
function definition(reference: MetricRef): MetricDefinition {
  return {
    ref: reference,
    name: reference.name,
    role: 'lagging',
    def: '按历史交付记录统计',
    target: '',
    unit: '项',
    feature: '',
    collect: { kind: 'script', run: ['node', 'collect.mjs'], retro: true }
  }
}
function catalog(reference: MetricRef, extra: MetricDefinition[] = []): MetricCatalog {
  return {
    scope,
    configurationCommit: reference.configurationCommit,
    configurationRef: 'main',
    timezone: 'Asia/Shanghai',
    definitions: [definition(reference), ...extra],
    problems: []
  }
}
function reading(reference: MetricRef, value: number): Extract<MetricReading, { status: 'ready' }> {
  return {
    status: 'ready',
    readings: [
      {
        ref: reference,
        value,
        unit: '项',
        collectedAt: '2026-09-24T10:00:00Z',
        source: 'repo/deliveries',
        collectorRevision: reference.configurationCommit,
        observation: {
          kind: 'window',
          start: '2026-09-20T16:00:00Z',
          end: '2026-09-27T16:00:00Z',
          granularity: 'week',
          timezone: 'Asia/Shanghai'
        }
      }
    ],
    run: {
      runId: reference.configurationCommit,
      startedAt: '2026-09-24T10:00:00Z',
      finishedAt: '2026-09-24T10:00:00Z',
      collectorRevision: reference.configurationCommit,
      dataTarget: { repository: 'repo', commit: reference.configurationCommit, hostId: 'local' }
    }
  }
}

let root: Root
let container: HTMLDivElement
let api: ReturnType<typeof usePlanMetrics>
function Probe({ plan }: { plan: PlanningMaterial }): null {
  api = usePlanMetrics(scope, undefined, plan)
  return null
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

it('discovers new metrics and refreshes the latest definition without rewriting an adopted plan baseline', async () => {
  const a = ref('a')
  const b = ref('b')
  const c = ref('c')
  const added = definition(ref('b', '验收数'))
  const plan: PlanningMaterial = {
    schema_version: 3,
    version: 'v1',
    cycleId: 'cycle',
    summary: { progress: '', risks: '' },
    goals: [
      {
        goalId: 'g1',
        title: '交付',
        metricTargets: [{ ref: a, target: '10', baseline: reading(a, 3).readings[0] }]
      }
    ],
    tasks: []
  }
  const savedPlan = structuredClone(plan)
  fixture.port.list.mockResolvedValue(catalog(b))
  fixture.port.read.mockImplementation(async ({ ref: reference }) => reading(reference, 12))
  fixture.port.refresh.mockImplementation(async ({ ref: reference }) => reading(reference, 12))
  await act(async () => root.render(<Probe plan={plan} />))
  expect(fixture.port.read).toHaveBeenCalledWith(expect.objectContaining({ scope, ref: b }))

  fixture.port.list.mockResolvedValue(catalog(b, [added]))
  await act(async () => api.reloadCatalog())
  expect(api.catalog?.definitions.map((item) => item.name)).toEqual(['交付数', '验收数'])
  expect(api.catalog?.configurationCommit).toBe(b.configurationCommit)

  const pendingCatalog = Promise.withResolvers<MetricCatalog>()
  fixture.port.list.mockReturnValueOnce(pendingCatalog.promise)
  const previousReload = api.reloadCatalog()
  fixture.port.list.mockResolvedValue(catalog(c, [added]))
  await act(async () => api.refresh(a))
  expect(fixture.port.refresh).toHaveBeenCalledExactlyOnceWith({
    scope,
    ref: c,
    window: expect.objectContaining({
      kind: 'range',
      granularity: 'week',
      timezone: 'Asia/Shanghai'
    })
  })
  expect(api.catalog?.configurationCommit).toBe(c.configurationCommit)
  expect(api.values[metricRefKey(a)]).toMatchObject({
    status: 'ready',
    readings: [{ ref: c, value: 12 }]
  })
  await act(async () => {
    pendingCatalog.resolve(catalog(b))
    await previousReload
  })
  expect(api.catalog?.configurationCommit).toBe(c.configurationCommit)
  expect(api.catalog?.definitions.map((item) => item.name)).toEqual(['交付数', '验收数'])
  expect(api.values[metricRefKey(a)]).toMatchObject({ readings: [{ ref: c, value: 12 }] })
  expect(plan).toEqual(savedPlan)
})

it('keeps both concurrent metric results while a slower refresh cannot roll back the catalog', async () => {
  const first = ref('a')
  const second = ref('a', '验收数')
  const older = catalog(ref('b'), [definition(ref('b', second.name))])
  const newer = catalog(ref('c'), [definition(ref('c', second.name))])
  const plan: PlanningMaterial = {
    schema_version: 3,
    version: 'v1',
    cycleId: 'cycle',
    summary: { progress: '', risks: '' },
    goals: [
      {
        goalId: 'g1',
        title: '交付',
        metricTargets: [first, second].map((reference) => ({ ref: reference, target: '10' }))
      }
    ],
    tasks: []
  }
  fixture.port.list.mockResolvedValue(older)
  fixture.port.read.mockImplementation(async ({ ref: reference }) =>
    reading(reference, reference.name === second.name ? 7 : 0)
  )
  await act(async () => root.render(<Probe plan={plan} />))

  const pending = Promise.withResolvers<MetricReading>()
  fixture.port.list.mockResolvedValueOnce(older).mockResolvedValueOnce(newer)
  fixture.port.refresh.mockImplementation(async ({ ref: reference }) =>
    reference.name === first.name ? pending.promise : reading(reference, 7)
  )
  let slowRefresh!: Promise<void>
  await act(async () => {
    slowRefresh = api.refresh(first)
  })
  await act(async () => api.refresh(second))
  expect(api.catalog?.configurationCommit).toBe(newer.configurationCommit)
  expect(api.values[metricRefKey(second)]).toMatchObject({
    status: 'ready',
    readings: [{ ref: ref('c', second.name), value: 7 }]
  })

  await act(async () => {
    pending.resolve(reading(ref('b'), 10))
    await slowRefresh
  })
  expect(api.catalog?.configurationCommit).toBe(newer.configurationCommit)
  expect(api.values[metricRefKey(first)]).toMatchObject({
    status: 'ready',
    readings: [{ ref: ref('b'), value: 10 }]
  })
  expect(api.values[metricRefKey(second)]).toMatchObject({
    status: 'ready',
    readings: [{ ref: ref('c', second.name), value: 7 }]
  })
})
