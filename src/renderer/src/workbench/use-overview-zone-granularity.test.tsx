// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi, type Mock } from 'vitest'
import type { MetricCatalog } from '../../../shared/workbench/metrics'
import type { OverviewReadResult } from './overview-metric-readings'
import type { ZoneGranularity } from './overview-zone-series'
import type { NativeWorkspaceScope } from './version-cycle/native-workspace'

const fixture = vi.hoisted(() => ({
  calls: [] as { granularity: ZoneGranularity; resolve(value: OverviewReadResult): void }[]
}))
vi.mock('./overview-metric-readings', () => ({
  readAllMetricReadings: vi.fn(
    (args: { granularity?: ZoneGranularity }) =>
      new Promise<OverviewReadResult>((resolve) => {
        fixture.calls.push({ granularity: args.granularity ?? 'week', resolve })
      })
  )
}))

import { readAllMetricReadings } from './overview-metric-readings'
import { useOverviewZoneGranularity } from './use-overview-zone-granularity'

const catalog = {
  scope: { repoId: 'repo', worktreeId: 'tree', hostId: 'local' },
  configurationCommit: 'c'.repeat(40),
  configurationRef: 'main',
  timezone: 'UTC',
  definitions: [],
  problems: []
} as MetricCatalog
const baseScope = { projectId: 'p', repoId: 'repo', hostId: 'local' } as NativeWorkspaceScope

function resultOf(granularity: ZoneGranularity): OverviewReadResult {
  return { north: null, map: { [granularity]: null }, problems: [] }
}

let identity = 0
const view = { catalog: catalog as MetricCatalog | null }
let root: Root
let container: HTMLDivElement
let apply: Mock<(result: OverviewReadResult) => void>
let setBusy: Mock<(busy: boolean) => void>
let loadEpoch: { current: number }
let api: ReturnType<typeof useOverviewZoneGranularity>

function Probe(): null {
  api = useOverviewZoneGranularity({
    identity: `grain-test-${identity}`,
    catalog: view.catalog,
    baseScope,
    baseWorktreeId: 'tree',
    loadEpoch,
    setBusy,
    apply
  })
  return null
}

async function render(): Promise<void> {
  await act(async () => root.render(<Probe />))
}

beforeEach(() => {
  identity++
  vi.clearAllMocks()
  fixture.calls.length = 0
  view.catalog = catalog
  apply = vi.fn()
  setBusy = vi.fn()
  loadEpoch = { current: 0 }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

/** Page loads mark the granularity they read with; an unmarked catalog reloads once. */
it('挂载时屏幕读数尚未标记粒度，则按默认周窗口补读一次', async () => {
  await render()
  expect(fixture.calls.map((call) => call.granularity)).toEqual(['week'])
  await act(async () => fixture.calls[0].resolve(resultOf('week')))
  expect(apply).toHaveBeenCalledTimes(1)
  expect(setBusy).toHaveBeenLastCalledWith(false)
})

it('页面已用当前粒度读过时（markRead 先于目录到达），不重复读取', async () => {
  view.catalog = null
  await render()
  expect(fixture.calls).toHaveLength(0)
  act(() => api.markRead('week'))
  view.catalog = catalog
  await render()
  expect(fixture.calls).toHaveLength(0)
})

it('切换粒度按新窗口重读一次；重复设置同粒度不再读', async () => {
  await render()
  await act(async () => fixture.calls[0].resolve(resultOf('week')))
  await act(async () => api.setGranularity('day'))
  expect(fixture.calls.map((call) => call.granularity)).toEqual(['week', 'day'])
  await act(async () => fixture.calls[1].resolve(resultOf('day')))
  expect(apply).toHaveBeenLastCalledWith(resultOf('day'))
  await act(async () => api.setGranularity('day'))
  expect(fixture.calls).toHaveLength(2)
})

it('过期响应被世代守卫拦下：只有最新一次读取落到屏幕', async () => {
  await render()
  await act(async () => api.setGranularity('day'))
  await act(async () => api.setGranularity('week'))
  // Three reloads went out; the first two are superseded by the newest epoch.
  expect(fixture.calls).toHaveLength(3)
  const stale = fixture.calls[0]
  const latest = fixture.calls.at(-1)!
  await act(async () => stale.resolve(resultOf('week')))
  expect(apply).not.toHaveBeenCalled()
  expect(setBusy).not.toHaveBeenLastCalledWith(false)
  await act(async () => latest.resolve(resultOf('week')))
  expect(apply).toHaveBeenCalledTimes(1)
  expect(setBusy).toHaveBeenLastCalledWith(false)
})

it('currentGranularity 读取当前选择，供页面稳定的 load/refresh 回调使用', async () => {
  await render()
  expect(api.currentGranularity()).toBe('week')
  await act(async () => api.setGranularity('day'))
  expect(api.currentGranularity()).toBe('day')
  expect(readAllMetricReadings).toHaveBeenCalled()
})
