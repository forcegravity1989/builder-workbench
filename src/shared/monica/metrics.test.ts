import { expect, it } from 'vitest'
import { currentMetricWeek } from './metric-windows'

it('defaults to the project timezone current week across a UTC date boundary', () => {
  expect(currentMetricWeek('Asia/Shanghai', '2026-09-27T17:00:00Z')).toEqual({
    kind: 'range',
    since: '2026-09-28',
    until: '2026-10-05',
    granularity: 'week',
    timezone: 'Asia/Shanghai'
  })
})
