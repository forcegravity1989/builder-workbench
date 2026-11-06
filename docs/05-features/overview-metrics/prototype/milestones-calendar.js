import { currentDay } from './milestones-data.js'

export const dayMs = 86400000
export const dayWidth = 36
export const labelWidth = 220
export const at = (date) => Date.parse(`${date}T00:00:00Z`)
export const iso = (value) => new Date(value).toISOString().slice(0, 10)
const monday = (value) => value - ((new Date(value).getUTCDay() + 6) % 7) * dayMs
const monthAt = (value, offset = 0) => {
  const date = new Date(`${value}-01T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + offset)
  return date.getTime()
}
const recordedMonths = (plan) =>
  [
    ...plan.months,
    ...(plan.milestones || []).map((m) => ({ month: m.date?.slice(0, 7) || m.month }))
  ]
    .filter((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m.month))
    .map((m) => m.month)
export function latestMonth(plan) {
  return (
    [
      ...plan.versions.filter((v) => Number.isFinite(at(v.start))).map((v) => v.start.slice(0, 7)),
      ...recordedMonths(plan)
    ]
      .sort()
      .at(-1) || currentDay.slice(0, 7)
  )
}
export function calendarFor(plan) {
  const focus = latestMonth(plan)
  const dated = plan.versions.filter((v) => Number.isFinite(at(v.start)) && v.start <= v.end)
  const start = monday(
    Math.min(
      monthAt(focus, -1),
      ...dated.map((v) => at(v.start)),
      ...recordedMonths(plan).map((month) => monthAt(month))
    )
  )
  const end = Math.max(monthAt(focus, 2) - dayMs, ...dated.map((v) => at(v.end))) + 7 * dayMs
  const weeks = []
  for (let value = start; value <= end; value += 7 * dayMs) {
    weeks.push({ id: `week-${iso(value)}`, start: iso(value), end: iso(value + 4 * dayMs) })
  }
  const months = []
  for (
    let value = monthAt(iso(start).slice(0, 7));
    value <= end;
    value = monthAt(iso(value).slice(0, 7), 1)
  ) {
    months.push({
      month: iso(value).slice(0, 7),
      start: value,
      end: monthAt(iso(value).slice(0, 7), 1) - dayMs
    })
  }
  return { start, end: start + weeks.length * 7 * dayMs - dayMs, weeks, months }
}
export function planWeek(plan, week, name) {
  const existing = plan.versions.find(
    (v) => v.id === week.id || (v.start <= week.end && v.end >= week.start)
  )
  if (existing) {
    return {
      plan: name
        ? {
            ...plan,
            versions: plan.versions.map((v) => (v.id === existing.id ? { ...v, name } : v))
          }
        : plan,
      version: { ...existing, ...(name ? { name } : {}) }
    }
  }
  let next = name?.trim()
  if (!next) {
    const last = plan.versions
      .toSorted((a, b) => a.start.localeCompare(b.start))
      .at(-1)
      ?.name.match(/^v(\d+)\.(\d+)\.(\d+)$/)
    const prefix = last ? `v${last[1]}.${last[2]}.` : 'v1.0.'
    let patch = last ? Number(last[3]) + 1 : 0
    while (plan.versions.some((v) => v.name === `${prefix}${patch}`)) {
      patch++
    }
    next = `${prefix}${patch}`
  }
  const version = { ...week, name: next }
  return {
    version,
    plan: {
      ...plan,
      versions: [...plan.versions, version]
    }
  }
}

export function availableWeek(_plan, from) {
  const start = monday(at(from))
  return { id: `week-${iso(start)}`, start: iso(start), end: iso(start + 4 * dayMs) }
}

const createFreeWeek = (source, date) => {
  let week = availableWeek(source, date)
  if (week.end < date) {
    week = availableWeek(source, iso(at(week.start) + 7 * dayMs))
  }
  for (;;) {
    const blockers = source.versions.filter((v) => v.start <= week.end && v.end >= week.start)
    if (!blockers.length) {
      let id = week.id
      while (source.versions.some((v) => v.id === id)) {
        id += '-next'
      }
      return planWeek(source, { ...week, id })
    }
    const lastEnd = Math.max(...blockers.map((v) => at(v.end)))
    week = availableWeek(source, iso(monday(lastEnd) + 7 * dayMs))
  }
}
export function nextVersion(plan, after) {
  const version = plan.versions
    .toSorted((a, b) => a.start.localeCompare(b.start))
    .find((v) => v.start > after)
  return version ? { plan, version } : createFreeWeek(plan, iso(at(after) + dayMs))
}

export function newFeatureVersions(plan, from) {
  const ordered = plan.versions.toSorted((a, b) => a.start.localeCompare(b.start))
  const current =
    ordered.find((v) => v.start <= from && v.end >= from) || ordered.find((v) => v.start > from)
  const first = current ? { plan, version: current } : createFreeWeek(plan, from)
  const second = nextVersion(first.plan, first.version.end)
  return { plan: second.plan, first: first.version, next: second.version }
}
