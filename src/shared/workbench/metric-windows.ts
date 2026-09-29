import type { MetricRange } from './metrics'

/** Weekly collectors report their actual coverage when the current week is incomplete. */
export function currentMetricWeek(timezone: string, now = new Date().toISOString()): MetricRange {
  const today = dayInTimezone(now, timezone)
  const since = addCalendarDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7))
  return { kind: 'range', since, until: addCalendarDays(since, 7), granularity: 'week', timezone }
}

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
  if (!Number.isFinite(target)) {
    throw new Error(`Invalid calendar date: ${day}`)
  }
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  const dateAt = (instant: number) => {
    const parts = format.formatToParts(instant)
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)!.value
    return `${part('year')}-${part('month')}-${part('day')}`
  }
  const hour = 3_600_000
  // Search chronologically: a repeated midnight must resolve to its first occurrence.
  for (let sample = target - 48 * hour; sample <= target + 48 * hour; sample += hour) {
    if (dateAt(sample) !== day) {
      continue
    }
    let before = sample - hour
    let inside = sample
    while (inside - before > 1) {
      const middle = Math.floor((before + inside) / 2)
      if (dateAt(middle) === day) {
        inside = middle
      } else {
        before = middle
      }
    }
    return new Date(inside).toISOString()
  }
  throw new Error(`Calendar date does not exist in ${timezone}: ${day}`)
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

export function metricBucketWindow(
  day: string,
  window: MetricRange,
  collectedAt: string,
  coverage?: { start: string; end: string }
) {
  if (
    window.granularity === 'week' &&
    [window.since, window.until].some((date) => new Date(`${date}T00:00:00Z`).getUTCDay() !== 1)
  ) {
    throw new Error('按周采集需使用周一到周一的完整周日期边界；任意日期范围请按日查询')
  }
  const bucketEnd = addCalendarDays(day, window.granularity === 'week' ? 7 : 1)
  if (day < window.since || bucketEnd > window.until) {
    throw new Error('Point is outside the requested window')
  }
  const bucketStart = calendarDayStart(day, window.timezone)
  const bucketUntil = calendarDayStart(bucketEnd, window.timezone)
  const start = coverage?.start ?? bucketStart
  const end = coverage?.end ?? bucketUntil
  if (!coverage && Date.parse(end) > Date.parse(collectedAt)) {
    throw new Error(
      '本日或本周尚未结束，脚本必须返回真实覆盖的 coverage.start/end，不能仅裁剪时间标签'
    )
  }
  if (
    Date.parse(start) < Date.parse(bucketStart) ||
    Date.parse(end) > Date.parse(bucketUntil) ||
    Date.parse(end) > Date.parse(collectedAt) ||
    Date.parse(end) <= Date.parse(start)
  ) {
    throw new Error('脚本声明的真实覆盖范围超出点位窗口或采集时间')
  }
  return {
    kind: 'window' as const,
    start,
    end,
    granularity: window.granularity,
    timezone: window.timezone
  }
}
