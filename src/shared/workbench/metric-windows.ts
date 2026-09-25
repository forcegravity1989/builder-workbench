import type { MetricRange } from './metrics'

export function dayInTimezone(instant: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(instant))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function addCalendarDays(day: string, count: number): string {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}

/** Calendar midnight can shift with DST; never model a local day as 24 elapsed hours. */
export function calendarDayStart(day: string, timezone: string): string {
  const target = Date.parse(`${day}T00:00:00Z`)
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  })
  let candidate = target
  const visited = new Set<number>()
  for (let pass = 0; pass < 6; pass++) {
    const parts = format.formatToParts(new Date(candidate))
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)!.value
    const local = Date.parse(
      `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}Z`
    )
    const delta = target - local
    if (delta === 0) {
      return new Date(candidate).toISOString()
    }
    visited.add(candidate)
    const next = candidate + delta
    if (visited.has(next)) {
      // Some zones skip midnight. The later candidate is the first valid time in the day.
      const shifted = Math.max(candidate, next)
      if (dayInTimezone(new Date(shifted).toISOString(), timezone) !== day) {
        throw new Error(`Calendar date does not exist in ${timezone}: ${day}`)
      }
      return new Date(shifted).toISOString()
    }
    candidate = next
  }
  throw new Error(`Cannot resolve calendar date in ${timezone}: ${day}`)
}

export function isoWeekStart(week: string): string {
  const match = /^(\d{4})-W(\d{2})$/.exec(week)
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 53) {
    throw new Error(`Invalid ISO week: ${week}`)
  }
  const januaryFourth = new Date(`${match[1]}-01-04T12:00:00Z`)
  januaryFourth.setUTCDate(
    januaryFourth.getUTCDate() - ((januaryFourth.getUTCDay() + 6) % 7) + (Number(match[2]) - 1) * 7
  )
  const thursday = new Date(januaryFourth)
  thursday.setUTCDate(thursday.getUTCDate() + 3)
  if (thursday.getUTCFullYear() !== Number(match[1])) {
    throw new Error(`Invalid ISO week: ${week}`)
  }
  return januaryFourth.toISOString().slice(0, 10)
}

export function metricBucketWindow(day: string, window: MetricRange, collectedAt: string) {
  const bucketEnd = addCalendarDays(day, window.granularity === 'week' ? 7 : 1)
  if (day >= window.until || bucketEnd <= window.since) {
    throw new Error('Point is outside the requested window')
  }
  const start = calendarDayStart(day > window.since ? day : window.since, window.timezone)
  const requestedEnd = calendarDayStart(
    bucketEnd < window.until ? bucketEnd : window.until,
    window.timezone
  )
  const end = Date.parse(requestedEnd) > Date.parse(collectedAt) ? collectedAt : requestedEnd
  if (Date.parse(end) <= Date.parse(start)) {
    throw new Error('Point has no observed time in the requested window')
  }
  return {
    kind: 'window' as const,
    start,
    end,
    granularity: window.granularity,
    timezone: window.timezone
  }
}
