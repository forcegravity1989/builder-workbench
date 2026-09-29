import { expect, it } from 'vitest'
import {
  MetricWindowSchema,
  type MetricDefinition,
  type MetricRange
} from '../../../shared/workbench/metrics'
import { calendarDayStart, isoWeekStart } from '../../../shared/workbench/metric-windows'
import { decodeMetricOutput } from './collector-output'

const definition: MetricDefinition = {
  ref: { name: 'count', definitionHash: 'hash', configurationCommit: 'a'.repeat(40) },
  name: 'count',
  def: 'count from source',
  target: '3',
  unit: '个',
  feature: '',
  role: 'lagging',
  collect: { kind: 'script', run: ['python', 'collect.py'], retro: true }
}
const window: MetricRange = {
  kind: 'range',
  since: '2026-03-01',
  until: '2026-03-15',
  granularity: 'day',
  timezone: 'America/New_York'
}
const input = {
  definition,
  window,
  collectedAt: '2026-03-15T12:00:00Z',
  collectorRevision: 'script-hash',
  source: 'source'
}

it('preserves real zero and missing days without manufacturing a continuous history', () => {
  const result = decodeMetricOutput({
    ...input,
    stdout: '{"points":[{"day":"2026-03-08","value":0},{"day":"2026-03-10","value":4}]}'
  })
  expect(result.map((point) => point.value)).toEqual([0, 4])
  expect(result[0].observation).toMatchObject({
    start: '2026-03-08T05:00:00.000Z',
    end: '2026-03-09T04:00:00.000Z'
  })
  expect(decodeMetricOutput({ ...input, stdout: '{"points":[]}' })).toEqual([])
})

it('treats day boundaries as calendar days through both DST transitions', () => {
  expect(calendarDayStart('2026-11-01', 'America/New_York')).toBe('2026-11-01T04:00:00.000Z')
  expect(calendarDayStart('2026-11-02', 'America/New_York')).toBe('2026-11-02T05:00:00.000Z')
  expect(calendarDayStart('2018-11-04', 'America/Sao_Paulo')).toBe('2018-11-04T03:00:00.000Z')
  expect(calendarDayStart('2021-10-29', 'Asia/Amman')).toBe('2021-10-28T21:00:00.000Z')
  expect(calendarDayStart('2021-10-30', 'Asia/Amman')).toBe('2021-10-29T22:00:00.000Z')
  expect(() => calendarDayStart('2011-12-30', 'Pacific/Apia')).toThrow('does not exist')
  expect(isoWeekStart('2026-W01')).toBe('2025-12-29')
  expect(() => isoWeekStart('2025-W53')).toThrow('Invalid ISO week')
})

it.each([
  '{"value":5}',
  '{"points":[{"day":"2026-03-08","value":0},{"day":"2026-03-08","value":1}]}',
  '{"points":[{"week":"2026-W10","value":1}]}',
  '{"points":[{"day":"2026-02-30","value":1}]}',
  '{"points":[{"day":"2026-03-16","value":1}]}',
  '{"points":[]} {"value":1}'
])('rejects mismatched or invalid historical output: %s', (stdout) => {
  expect(() => decodeMetricOutput({ ...input, stdout })).toThrow()
})

it('requires the source to declare its actual coverage for an in-progress bucket', () => {
  const current = { ...input, collectedAt: '2026-03-08T12:00:00Z' }
  expect(() =>
    decodeMetricOutput({ ...current, stdout: '{"points":[{"day":"2026-03-08","value":2}]}' })
  ).toThrow('真实覆盖')
  const [reading] = decodeMetricOutput({
    ...current,
    stdout:
      '{"points":[{"day":"2026-03-08","value":2,"coverage":{"start":"2026-03-08T05:00:00Z","end":"2026-03-08T11:59:00Z"}}]}'
  })
  expect(reading.observation).toMatchObject({ end: '2026-03-08T11:59:00Z' })
})

it('never relabels an entire ISO week value as an arbitrary two-day total', () => {
  const partial: MetricRange = {
    kind: 'range',
    since: '2026-09-23',
    until: '2026-09-25',
    granularity: 'week',
    timezone: 'UTC'
  }
  expect(MetricWindowSchema.safeParse(partial).success).toBe(false)
  expect(() =>
    decodeMetricOutput({
      ...input,
      window: partial,
      collectedAt: '2026-09-29T12:00:00Z',
      stdout: '{"points":[{"week":"2026-W39","value":42}]}'
    })
  ).toThrow('完整周')
  const full = { ...partial, since: '2026-09-21', until: '2026-09-28' }
  const [reading] = decodeMetricOutput({
    ...input,
    window: full,
    collectedAt: '2026-09-29T12:00:00Z',
    stdout: '{"points":[{"week":"2026-W39","value":42}]}'
  })
  expect(reading).toMatchObject({
    value: 42,
    observation: { start: '2026-09-21T00:00:00.000Z', end: '2026-09-28T00:00:00.000Z' }
  })
})
