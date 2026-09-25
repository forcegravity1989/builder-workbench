import { expect, it } from 'vitest'
import type { MetricDefinition, MetricRange } from '../../../shared/workbench/metrics'
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

it('keeps current strings as timestamped observations and refuses to relabel them as history', () => {
  const current = {
    ...input,
    definition: { ...definition, collect: { ...definition.collect, retro: false } }
  }
  const stdout = '{"value":"准备中","observed_at":"2026-03-15T10:00:00Z"}'
  expect(() => decodeMetricOutput({ ...current, stdout })).toThrow('无法补采历史窗口')
  const [reading] = decodeMetricOutput({
    ...current,
    stdout,
    window: { kind: 'current', timezone: 'UTC' }
  })
  expect(reading).toMatchObject({
    value: '准备中',
    observation: { kind: 'instant', observedAt: '2026-03-15T10:00:00Z' }
  })
})

it('limits the in-progress bucket to the actual collection time', () => {
  const [reading] = decodeMetricOutput({
    ...input,
    collectedAt: '2026-03-08T12:00:00Z',
    stdout: '{"points":[{"day":"2026-03-08","value":2}]}'
  })
  expect(reading.observation).toMatchObject({ end: '2026-03-08T12:00:00Z' })
})
