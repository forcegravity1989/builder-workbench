import calendar2026 from './work-calendar-2026.json'

export type WorkCalendarDay = { working: boolean; badge: '班' | '休' | null; preset: boolean }

const workDays = new Set(calendar2026.workDays)
const restDays = new Set(calendar2026.restDays)

export function workCalendarDay(date: string): WorkCalendarDay {
  const day = new Date(`${date}T00:00:00Z`)
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) {
    throw new Error(`工作日历日期无效：${date}`)
  }
  if (restDays.has(date)) {
    return { working: false, badge: '休', preset: true }
  }
  if (workDays.has(date)) {
    return { working: true, badge: '班', preset: true }
  }
  const weekday = day.getUTCDay()
  return { working: weekday !== 0 && weekday !== 6, badge: null, preset: date.startsWith('2026-') }
}
