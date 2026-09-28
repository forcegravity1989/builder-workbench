import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  MetricCatalog,
  MetricDefinition,
  MetricReadRequest
} from '../../../shared/workbench/metrics'
import { currentMetricWeek } from '../../../shared/workbench/metric-windows'
import { zoneChartRange } from './overview-zone-series'

const requests = vi.hoisted(() => ({
  read: [] as MetricReadRequest[],
  refresh: [] as MetricReadRequest[]
}))
vi.mock('./metrics-port', () => ({
  nativeMetricsPort: () => ({
    list: async () => {
      throw new Error('not used')
    },
    read: async (request: MetricReadRequest) => {
      requests.read.push(request)
      return { status: 'unknown', reason: { code: 'not-collected', message: '尚未采集' } }
    },
    refresh: async (request: MetricReadRequest) => {
      requests.refresh.push(request)
      return { status: 'unknown', reason: { code: 'not-collected', message: '尚未采集' } }
    }
  })
}))

import { readAllMetricReadings, refreshMetricReadings } from './overview-metric-readings'

const TZ = 'UTC'
const scope = { repoId: 'repo', worktreeId: 'tree', hostId: 'local' }

function def(overrides: Partial<MetricDefinition> & { name: string }): MetricDefinition {
  return {
    ref: {
      name: overrides.name,
      definitionHash: `h-${overrides.name}`,
      configurationCommit: 'a'.repeat(40)
    },
    role: 'lagging',
    def: '',
    target: '',
    unit: '',
    feature: '',
    collect: { kind: 'script', run: [], retro: true },
    ...overrides
  }
}

const catalog: MetricCatalog = {
  scope,
  configurationCommit: 'c'.repeat(40),
  configurationRef: 'main',
  timezone: TZ,
  definitions: [
    def({ name: 'north', role: 'north_star' }),
    def({ name: 'zone-retro' }),
    def({ name: 'zone-current', collect: { kind: 'script', run: [], retro: false } })
  ],
  problems: []
}

beforeEach(() => {
  requests.read.length = 0
  requests.refresh.length = 0
})

function windowFor(list: MetricReadRequest[], name: string): MetricReadRequest['window'] {
  return list.find((request) => request.ref.name === name)!.window
}

describe('readAllMetricReadings windows', () => {
  it('北极星保持单周当前窗口；滞后/引领按粒度取图表窗口；仅当前值定义保持 instant', async () => {
    await readAllMetricReadings({ scope, owner: undefined, catalog, granularity: 'week' })
    expect(windowFor(requests.read, 'north')).toEqual(currentMetricWeek(TZ))
    expect(windowFor(requests.read, 'zone-retro')).toEqual(zoneChartRange('week', TZ))
    expect(windowFor(requests.read, 'zone-current')).toEqual({ kind: 'current', timezone: TZ })
  })

  it('日粒度切换后，可回溯定义改按日窗口经同一 read RPC 重读', async () => {
    await readAllMetricReadings({ scope, owner: undefined, catalog, granularity: 'day' })
    const window = windowFor(requests.read, 'zone-retro')
    expect(window).toEqual(zoneChartRange('day', TZ))
    expect(window.kind === 'range' && window.granularity).toBe('day')
    expect(windowFor(requests.read, 'north')).toEqual(currentMetricWeek(TZ))
  })

  it('单个定义读取失败落入 problems，其余定义不受影响', async () => {
    const result = await readAllMetricReadings({ scope, owner: undefined, catalog })
    expect(result.problems).toEqual([])
    expect(Object.keys(result.map)).toHaveLength(3)
    expect(result.north).not.toBeNull()
  })
})

describe('refreshMetricReadings windows', () => {
  it('刷新按同一窗口协议执行采集后重读，不另造读取路径', async () => {
    await refreshMetricReadings({ scope, owner: undefined, catalog, granularity: 'week' })
    expect(windowFor(requests.refresh, 'zone-retro')).toEqual(zoneChartRange('week', TZ))
    expect(windowFor(requests.refresh, 'north')).toEqual(currentMetricWeek(TZ))
    expect(requests.read).toHaveLength(3)
  })
})
