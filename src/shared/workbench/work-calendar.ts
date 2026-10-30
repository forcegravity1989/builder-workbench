export type WorkCalendarDay = { working: boolean; badge: '班' | '休' | null; preset: boolean }
type AnnualCalendar = { workDays: readonly string[]; restDays: readonly string[] }

// Internal calendar data can be supplied for a whole year at build time.
const annualCalendars: Readonly<Record<string, AnnualCalendar>> = {}
const yearIndexes = new Map<string, Map<string, WorkCalendarDay>>()

export function workCalendarDay(date: string): WorkCalendarDay {
  const year = date.slice(0, 4)
  if (!yearIndexes.has(year)) {
    const calendar = annualCalendars[year]
    const work = new Set(calendar?.workDays),
      rest = new Set(calendar?.restDays)
    const index = new Map<string, WorkCalendarDay>()
    const cursor = new Date(`${year}-01-01T00:00:00Z`)
    while (
      Number.isFinite(cursor.getTime()) &&
      String(cursor.getUTCFullYear()).padStart(4, '0') === year
    ) {
      const key = cursor.toISOString().slice(0, 10)
      index.set(key, {
        working: work.has(key) || (!rest.has(key) && ![0, 6].includes(cursor.getUTCDay())),
        badge: work.has(key) ? '班' : rest.has(key) ? '休' : null,
        preset: Boolean(calendar)
      })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    yearIndexes.set(year, index)
  }
  const result = yearIndexes.get(year)!.get(date)
  if (!result) {
    throw new Error(`工作日历日期无效：${date}`)
  }
  return result
}
