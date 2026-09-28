import { describe, expect, it } from 'vitest'
import { addCalendarDays } from '../../../shared/workbench/metric-windows'
import type {
  MetricDefinition,
  MetricRange,
  MetricReading
} from '../../../shared/workbench/metrics'
import {
  groupZonePlots,
  isoWeekLabel,
  numericTarget,
  splitSeriesByAxis,
  zoneBucketLabels,
  zoneChartRange,
  zonePointState,
  zoneWindowForDefinition,
  ZONE_DAY_BUCKETS,
  ZONE_WEEK_BUCKETS
} from './overview-zone-series'

const NOW = '2026-09-24T10:00:00.000Z' // Thursday of 2026-W39
const TZ = 'UTC'

function def(overrides: Partial<MetricDefinition> & { name: string }): MetricDefinition {
  return {
    ref: {
      name: overrides.name,
      definitionHash: `hash-${overrides.name}`,
      configurationCommit: 'a'.repeat(40)
    },
    role: 'lagging',
    def: `${overrides.name} 定义`,
    target: '',
    unit: '',
    feature: '',
    collect: { kind: 'script', run: ['node', 'x.js'], retro: true },
    ...overrides
  }
}

function windowReading(
  points: { day: string; value: number | string }[],
  granularity: 'day' | 'week' = 'week'
): MetricReading {
  return {
    status: 'ready',
    readings: points.map((point) => ({
      ref: { name: 'm', definitionHash: 'h', configurationCommit: 'a'.repeat(40) },
      value: point.value,
      unit: '',
      collectedAt: `${point.day}T12:00:00.000Z`,
      source: 'repo@a',
      collectorRevision: 'rev',
      observation: {
        kind: 'window',
        start: `${point.day}T00:00:00.000Z`,
        end: `${addCalendarDays(point.day, granularity === 'week' ? 7 : 1)}T00:00:00.000Z`,
        granularity,
        timezone: TZ
      }
    })),
    run: {
      runId: 'r',
      startedAt: NOW,
      finishedAt: NOW,
      collectorRevision: 'rev',
      dataTarget: { repository: 'repo', commit: 'b'.repeat(40), hostId: 'local' }
    }
  }
}

describe('zoneChartRange', () => {
  it('周粒度返回周一到周一的完整周边界，覆盖五个周桶', () => {
    const range = zoneChartRange('week', TZ, NOW)
    expect(range.granularity).toBe('week')
    // 2026-09-24 is Thursday; its Monday is 2026-09-21 (2026-W39).
    expect(range.since).toBe('2026-08-24')
    expect(range.until).toBe('2026-09-28')
    expect(new Date(`${range.since}T00:00:00Z`).getUTCDay()).toBe(1)
    expect(new Date(`${range.until}T00:00:00Z`).getUTCDay()).toBe(1)
    expect(zoneBucketLabels(range)).toHaveLength(ZONE_WEEK_BUCKETS)
  })

  it('日粒度返回含今日的十四个日桶，左闭右开', () => {
    const range = zoneChartRange('day', TZ, NOW)
    expect(range.since).toBe('2026-09-11')
    expect(range.until).toBe('2026-09-25')
    expect(zoneBucketLabels(range)).toHaveLength(ZONE_DAY_BUCKETS)
    expect(zoneBucketLabels(range).at(-1)).toBe('09-24')
  })

  it('周标签是 ISO 周，日标签是 MM-DD', () => {
    expect(zoneBucketLabels(zoneChartRange('week', TZ, NOW))).toEqual([
      '2026-W35',
      '2026-W36',
      '2026-W37',
      '2026-W38',
      '2026-W39'
    ])
  })
})

describe('isoWeekLabel', () => {
  it('周四所在年份决定 ISO 年', () => {
    expect(isoWeekLabel('2025-12-29')).toBe('2026-W01')
    expect(isoWeekLabel('2026-08-31')).toBe('2026-W36')
  })
})

describe('zoneWindowForDefinition', () => {
  it('retro 定义按粒度取图表窗口；仅当前值定义保持 instant 窗口', () => {
    const retro = def({ name: 'a' })
    const current = def({ name: 'b', collect: { kind: 'script', run: [], retro: false } })
    const range = zoneWindowForDefinition(retro, TZ, 'day', NOW) as MetricRange
    expect(range.kind).toBe('range')
    expect(range.granularity).toBe('day')
    expect(zoneWindowForDefinition(current, TZ, 'day', NOW)).toEqual({
      kind: 'current',
      timezone: TZ
    })
  })
})

describe('groupZonePlots', () => {
  it('一图一滞后：leads 按名字挂到对应滞后', () => {
    const plots = groupZonePlots([
      def({ name: 'lag1' }),
      def({ name: 'lag2' }),
      def({ name: 'lead1', role: 'leading', leads: 'lag2' })
    ])
    expect(plots).toHaveLength(2)
    expect(plots[0].leads).toHaveLength(0)
    expect(plots[1].leads.map((item) => item.name)).toEqual(['lead1'])
  })

  it('leads 空缺或未匹配时独立展示，不伪造关联', () => {
    const plots = groupZonePlots([
      def({ name: 'lag1' }),
      def({ name: 'lag2' }),
      def({ name: 'lead-empty', role: 'leading' }),
      def({ name: 'lead-unknown', role: 'leading', leads: '不存在的滞后' })
    ])
    expect(plots[0].leads).toEqual([])
    expect(plots[2].lagging).toBeNull()
    expect(plots[2].leads.map((item) => item.name)).toEqual(['lead-empty', 'lead-unknown'])
  })

  it('只有引领的页签保持可见，不伪造滞后锚点；无定义则无图', () => {
    const leadsOnly = groupZonePlots([def({ name: 'lead', role: 'leading' })])
    expect(leadsOnly).toHaveLength(1)
    expect(leadsOnly[0].lagging).toBeNull()
    expect(leadsOnly[0].leads.map((item) => item.name)).toEqual(['lead'])
    expect(groupZonePlots([])).toEqual([])
  })
})

describe('zonePointState', () => {
  const range = zoneChartRange('week', TZ, NOW)
  const labels = zoneBucketLabels(range)

  it('未读取保持 unread，不补零', () => {
    expect(zonePointState(null, labels, range, TZ)).toEqual({ kind: 'unread' })
  })

  it('失败保持 Unknown 文案，陈旧证据保留原时间', () => {
    const reading: MetricReading = {
      status: 'error',
      reason: { code: 'collector-failed', message: '脚本以 1 结束' },
      previous: windowReading([{ day: '2026-09-21', value: 7 }]) as Extract<
        MetricReading,
        { status: 'ready' }
      >
    }
    const state = zonePointState(reading, labels, range, TZ)
    expect(state.kind).toBe('unknown')
    if (state.kind !== 'unknown') {
      return
    }
    expect(state.message).toBe('脚本以 1 结束')
    expect(state.stale).toEqual({ value: 7, collectedAt: '2026-09-21T12:00:00.000Z' })
  })

  it('历史点按真实窗口落桶；缺失桶留空不补零', () => {
    const state = zonePointState(
      windowReading([
        { day: '2026-08-31', value: 2 },
        { day: '2026-09-21', value: 5 }
      ]),
      labels,
      range,
      TZ
    )
    expect(state.kind).toBe('ready')
    if (state.kind !== 'ready') {
      return
    }
    expect(state.values).toEqual([null, 2, null, null, 5])
    expect(state.latest).toMatchObject({ value: 5 })
    expect(state.latestIndex).toBe(4)
    expect(state.latestIsText).toBe(false)
  })

  it('字符串读数不做数值曲线，只作为当前值文本', () => {
    const state = zonePointState(
      windowReading([{ day: '2026-09-21', value: '达标' }]),
      labels,
      range,
      TZ
    )
    if (state.kind !== 'ready') {
      throw new Error('expected ready')
    }
    expect(state.values).toEqual([null, null, null, null, null])
    expect(state.latestIsText).toBe(true)
    expect(state.latest?.value).toBe('达标')
  })

  it('仅当前值指标（无窗口）不落桶，只保留 instant 当前值', () => {
    const reading: MetricReading = {
      status: 'ready',
      readings: [
        {
          ref: { name: 'm', definitionHash: 'h', configurationCommit: 'a'.repeat(40) },
          value: 3,
          unit: '',
          collectedAt: NOW,
          source: 'repo@a',
          collectorRevision: 'rev',
          observation: { kind: 'instant', observedAt: NOW }
        }
      ],
      run: {
        runId: 'r',
        startedAt: NOW,
        finishedAt: NOW,
        collectorRevision: 'rev',
        dataTarget: { repository: 'repo', commit: 'b'.repeat(40), hostId: 'local' }
      }
    }
    const state = zonePointState(reading, labels, null, TZ)
    if (state.kind !== 'ready') {
      throw new Error('expected ready')
    }
    expect(state.values.every((value) => value === null)).toBe(true)
    expect(state.latest).toMatchObject({ value: 3, coverageEnd: null })
  })
})

describe('numericTarget / splitSeriesByAxis', () => {
  it('只有纯数字目标画参考线；比较符目标保持行内文本', () => {
    expect(numericTarget('3')).toBe(3)
    expect(numericTarget('≥3')).toBeNull()
    expect(numericTarget('')).toBeNull()
  })

  it('两个单位内共图（左/右轴），三个及以上拆对齐小图', () => {
    const series = [{ unit: '个' }, { unit: '个' }, { unit: '次' }, { unit: '小时' }]
    expect(splitSeriesByAxis([{ unit: '个' }, { unit: '次' }])).toHaveLength(1)
    const split = splitSeriesByAxis(series)
    expect(split).toHaveLength(3)
    expect(split[0]).toHaveLength(2)
  })
})
