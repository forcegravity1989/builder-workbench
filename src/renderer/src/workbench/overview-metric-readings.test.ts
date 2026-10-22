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
  refresh: [] as MetricReadRequest[],
  failedName: null as string | null
}))
vi.mock('./metrics-port', () => ({
  nativeMetricsPort: () => ({
    list: async () => {
      throw new Error('not used')
    },
    read: async (request: MetricReadRequest) => {
      requests.read.push(request)
      if (request.ref.name === requests.failedName) {
        throw new Error('来源不可用')
      }
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
  features: [],
  definitions: [def({ name: 'north', role: 'north_star' }), def({ name: 'zone-retro' })],
  problems: []
}

beforeEach(() => {
  requests.read.length = 0
  requests.refresh.length = 0
  requests.failedName = null
})

function windowFor(list: MetricReadRequest[], name: string): MetricReadRequest['window'] {
  return list.find((request) => request.ref.name === name)!.window
}

describe('readAllMetricReadings windows', () => {
  it('北极星保持单周当前窗口；滞后/引领按粒度取图表窗口', async () => {
    await readAllMetricReadings({ scope, owner: undefined, catalog, granularity: 'week' })
    expect(windowFor(requests.read, 'north')).toEqual(currentMetricWeek(TZ))
    expect(windowFor(requests.read, 'zone-retro')).toEqual(zoneChartRange('week', TZ))
  })

  it('日粒度切换后，可回溯定义改按日窗口经同一 read RPC 重读', async () => {
    await readAllMetricReadings({ scope, owner: undefined, catalog, granularity: 'day' })
    const window = windowFor(requests.read, 'zone-retro')
    expect(window).toEqual(zoneChartRange('day', TZ))
    expect(window.kind === 'range' && window.granularity).toBe('day')
    expect(windowFor(requests.read, 'north')).toEqual(currentMetricWeek(TZ))
  })

  it('单个定义读取失败落入 problems，其余定义不受影响', async () => {
    requests.failedName = 'zone-retro'
    const result = await readAllMetricReadings({ scope, owner: undefined, catalog })
    expect(result.problems).toEqual(['zone-retro 读数：来源不可用'])
    expect(result.map['h-zone-retro']).toBeNull()
    expect(result.north).toEqual({
      status: 'unknown',
      reason: { code: 'not-collected', message: '尚未采集' }
    })
    expect(result.map['h-north']).toBe(result.north)
  })
})

describe('refreshMetricReadings windows', () => {
  it('刷新按同一窗口协议执行采集，直接采用返回读数', async () => {
    await refreshMetricReadings({ scope, owner: undefined, catalog, granularity: 'week' })
    expect(windowFor(requests.refresh, 'zone-retro')).toEqual(zoneChartRange('week', TZ))
    expect(windowFor(requests.refresh, 'north')).toEqual(currentMetricWeek(TZ))
    expect(requests.read).toHaveLength(0)
  })
})
