import type { MetricRange, MetricReading } from '../../../shared/workbench/metrics'
import {
  addCalendarDays,
  currentMetricWeek,
  dayInTimezone
} from '../../../shared/workbench/metric-windows'

export type ZoneGranularity = 'day' | 'week'

/** Chart span mirrors the hi-fi target: five weekly buckets or fourteen daily buckets. */
export const ZONE_WEEK_BUCKETS = 5
export const ZONE_DAY_BUCKETS = 14

/** Range window covering the chart span; weekly buckets keep the protocol's Monday boundaries. */
export function zoneChartRange(
  granularity: ZoneGranularity,
  timezone: string,
  now = new Date().toISOString()
): MetricRange {
  if (granularity === 'week') {
    const week = currentMetricWeek(timezone, now)
    return { ...week, since: addCalendarDays(week.since, -(ZONE_WEEK_BUCKETS - 1) * 7) }
  }
  const today = dayInTimezone(now, timezone)
  return {
    kind: 'range',
    since: addCalendarDays(today, -(ZONE_DAY_BUCKETS - 1)),
    until: addCalendarDays(today, 1),
    granularity: 'day',
    timezone
  }
}

/** ISO week of a Monday bucket, e.g. 2026-08-31 → "2026-W36"; the week's Thursday owns the year. */
export function isoWeekLabel(monday: string): string {
  const thursday = addCalendarDays(monday, 3)
  const year = Number(thursday.slice(0, 4))
  const januaryFirst = Date.parse(`${year}-01-01T12:00:00Z`)
  const week = Math.floor((Date.parse(`${thursday}T12:00:00Z`) - januaryFirst) / 604_800_000) + 1
  return `${year}-W${String(week).padStart(2, '0')}`
}

/** X-axis labels for the requested span; missing buckets stay empty later, never zero-filled. */
export function zoneBucketLabels(range: MetricRange): string[] {
  const step = range.granularity === 'week' ? 7 : 1
  const labels: string[] = []
  for (let day = range.since; day < range.until; day = addCalendarDays(day, step)) {
    labels.push(range.granularity === 'week' ? isoWeekLabel(day) : day.slice(5))
  }
  return labels
}

function bucketIndexOf(day: string, range: MetricRange): number | null {
  if (day < range.since || day >= range.until) {
    return null
  }
  const offset =
    (Date.parse(`${day}T12:00:00Z`) - Date.parse(`${range.since}T12:00:00Z`)) / 86_400_000
  return Math.floor(offset / (range.granularity === 'week' ? 7 : 1))
}

export type ZonePointState =
  | { kind: 'unread' }
  | {
      kind: 'unknown'
      message: string
      /** Identifiable stale evidence keeps its original timestamp; it is never refreshed or zeroed. */
      stale: { value: string | number; collectedAt: string } | null
    }
  | {
      kind: 'ready'
      /** Numeric curve values; string readings never become points. */
      values: (number | null)[]
      /** Most recent evidence regardless of type, for the row's current value. */
      latest: { value: string | number; collectedAt: string } | null
    }

function staleOf(reading: MetricReading): { value: string | number; collectedAt: string } | null {
  const previous = reading.status === 'ready' ? null : reading.previous
  const point = previous?.readings.at(-1)
  return point ? { value: point.value, collectedAt: point.collectedAt } : null
}

/**
 * Honest series extraction for one definition against the requested span:
 * points map into buckets by their real window start; gaps stay null; string
 * readings are surfaced as text but never plotted; failures keep Unknown wording
 * with identifiable stale evidence, never a refreshed timestamp or a zero.
 */
export function zonePointState(
  reading: MetricReading | null,
  labels: string[],
  range: MetricRange,
  timezone: string
): ZonePointState {
  if (reading === null) {
    return { kind: 'unread' }
  }
  if (reading.status !== 'ready') {
    return { kind: 'unknown', message: reading.reason.message, stale: staleOf(reading) }
  }
  const values: (number | null)[] = labels.map(() => null)
  let latest: Extract<ZonePointState, { kind: 'ready' }>['latest'] = null
  for (const point of reading.readings) {
    latest = {
      value: point.value,
      collectedAt: point.collectedAt
    }
    if (point.observation.kind === 'window' && typeof point.value === 'number') {
      const index = bucketIndexOf(dayInTimezone(point.observation.start, timezone), range)
      if (index !== null && index < values.length) {
        values[index] = point.value
      }
    }
  }
  return {
    kind: 'ready',
    values,
    latest
  }
}
