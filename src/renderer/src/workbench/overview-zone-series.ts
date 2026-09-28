import type {
  MetricDefinition,
  MetricRange,
  MetricReading,
  MetricWindow
} from '../../../shared/workbench/metrics'
import {
  addCalendarDays,
  currentMetricWeek,
  dayInTimezone
} from '../../../shared/workbench/metric-windows'

export type ZoneGranularity = 'day' | 'week'

/** Chart span mirrors the hi-fi target: five weekly buckets or fourteen daily buckets. */
export const ZONE_WEEK_BUCKETS = 5
export const ZONE_DAY_BUCKETS = 14

export const ZONE_MAIN_TAB = '主要'

/** Lagging draws in the secondary accent; leads cycle through the warm ramp (hi-fi palette). */
export const ZONE_LAG_COLOR = 'var(--color-accent-2, #4c73a5)'
export const ZONE_LEAD_COLORS = [
  'var(--color-accent, #d97757)',
  'var(--color-success, #579766)',
  'var(--color-warning, #ce9042)'
] as const

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

/** retro definitions are queried over the chart span; current-only sources keep the instant window. */
export function zoneWindowForDefinition(
  definition: MetricDefinition,
  timezone: string,
  granularity: ZoneGranularity,
  now = new Date().toISOString()
): MetricWindow {
  return definition.collect.retro
    ? zoneChartRange(granularity, timezone, now)
    : { kind: 'current', timezone }
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
      latest: { value: string | number; collectedAt: string; coverageEnd: string | null } | null
      /** Index of the newest bucketed point on the axis, when it lands inside the span. */
      latestIndex: number | null
      /** True when the newest evidence value is a string reading (row shows text, no curve). */
      latestIsText: boolean
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
  range: MetricRange | null,
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
  let latestIndex: number | null = null
  for (const point of reading.readings) {
    latest = {
      value: point.value,
      collectedAt: point.collectedAt,
      coverageEnd: point.observation.kind === 'window' ? point.observation.end : null
    }
    latestIndex = null
    if (range && point.observation.kind === 'window' && typeof point.value === 'number') {
      const index = bucketIndexOf(dayInTimezone(point.observation.start, timezone), range)
      if (index !== null && index < values.length) {
        values[index] = point.value
        latestIndex = index
      }
    }
  }
  return {
    kind: 'ready',
    values,
    latest,
    latestIndex,
    latestIsText: latest !== null && typeof latest.value === 'string'
  }
}

export type ZonePlot = { lagging: MetricDefinition | null; leads: MetricDefinition[] }

/** Only explicit matching leads share a plot; unresolved relationships stay separate. */
export function groupZonePlots(defs: MetricDefinition[]): ZonePlot[] {
  const lagging = defs.filter((def) => def.role === 'lagging')
  const leads = defs.filter((def) => def.role === 'leading')
  if (lagging.length === 0) {
    return leads.length > 0 ? [{ lagging: null, leads }] : []
  }
  const plots = new Map<string, ZonePlot>(
    lagging.map((def) => [def.name, { lagging: def, leads: [] }])
  )
  const unlinked: ZonePlot = { lagging: null, leads: [] }
  for (const lead of leads) {
    const target = plots.get(lead.leads?.trim() ?? '') ?? unlinked
    target.leads.push(lead)
  }
  return [
    ...lagging.map((def) => plots.get(def.name)!),
    ...(unlinked.leads.length ? [unlinked] : [])
  ]
}

/** Numeric target lines only when the target is a bare number; "≥3"-style text stays a row label. */
export function numericTarget(target: string): number | null {
  const match = /^(-?\d+(?:\.\d+)?)$/.exec(target.trim())
  return match ? Number(match[1]) : null
}

/**
 * Axis split per the spec: one unit shares the left axis, a second unit gets the
 * right axis; three or more units fall back to aligned small charts, one per unit,
 * so no series is ever scaled against a mismatched axis.
 */
export function splitSeriesByAxis<T extends { unit: string }>(series: T[]): T[][] {
  const units = [...new Set(series.map((item) => item.unit))]
  if (units.length <= 2) {
    return [series]
  }
  return units.map((unit) => series.filter((item) => item.unit === unit))
}
