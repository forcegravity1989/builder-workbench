import { expect, it } from 'vitest'
import { sameMetricDefinition, type MetricReadingEvidence } from './metrics'
import { currentMetricWeek } from './metric-windows'

it('defaults to the project timezone current week across a UTC date boundary', () => {
  expect(currentMetricWeek('Asia/Shanghai', '2026-09-27T17:00:00Z')).toEqual({
    kind: 'range', since: '2026-09-28', until: '2026-10-05', granularity: 'week', timezone: 'Asia/Shanghai'
  })
})

it('checks definition identity without implying complete and partial weeks are comparable', () => {
  const full: MetricReadingEvidence = {
    ref: { name: 'count', definitionHash: 'definition', configurationCommit: 'a'.repeat(40) },
    value: 7,
    unit: '个',
    collectedAt: '2026-09-14T00:00:00Z',
    source: 'source',
    collectorRevision: 'collector',
    observation: {
      kind: 'window',
      start: '2026-09-07T00:00:00Z',
      end: '2026-09-14T00:00:00Z',
      granularity: 'week',
      timezone: 'UTC'
    }
  }
  const partial: MetricReadingEvidence = {
    ...full,
    value: 2,
    collectedAt: '2026-09-16T00:00:00Z',
    observation: {
      kind: 'window',
      start: '2026-09-14T00:00:00Z',
      end: '2026-09-16T00:00:00Z',
      granularity: 'week',
      timezone: 'UTC'
    }
  }
  expect(sameMetricDefinition(full, partial)).toBe(true)
  expect(
    sameMetricDefinition(full, {
      ...partial,
      ref: { ...partial.ref, definitionHash: 'new-definition' }
    })
  ).toBe(false)
  expect(sameMetricDefinition(full, { ...partial, collectorRevision: 'new-collector' })).toBe(false)
})
