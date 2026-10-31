import type { MilestoneDraft, ScheduledVersion } from './project-milestones'

export function editMilestoneVersionName(
  draft: MilestoneDraft,
  cycleId: string,
  name: string,
  commit?: { previousName: string; registered: readonly ScheduledVersion[] }
): { draft: MilestoneDraft; problem?: string } {
  let problem: string | undefined
  if (commit && !name.trim()) {
    const registered = commit.registered.find((v) => v.cycleId === cycleId)
    const used = draft.material.features.some((f) =>
      f.deliveries.some((d) => d.version.cycleId === cycleId)
    )
    if (!registered && !used) {
      return { draft: { ...draft, versions: draft.versions.filter((v) => v.cycleId !== cycleId) } }
    }
    name = commit.previousName || registered?.version || ''
    problem = used ? '该版本仍有特性安排，请先移走安排' : '该版本已提交，不能通过清空名称移除'
  }
  return {
    problem,
    draft: {
      ...draft,
      versions: draft.versions.map((v) => (v.cycleId === cycleId ? { ...v, version: name } : v)),
      material: {
        ...draft.material,
        features: draft.material.features.map((f) => ({
          ...f,
          deliveries: f.deliveries.map((d) =>
            d.version.cycleId === cycleId ? { ...d, version: { ...d.version, version: name } } : d
          )
        }))
      }
    }
  }
}

export const milestoneDay = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86400000
export const milestoneDate = (day: number) => new Date(day * 86400000).toISOString().slice(0, 10)
export const milestoneToday = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())
}
export type MilestoneWeek = { start: string; end: string }
export const datedMilestoneVersions = (draft: MilestoneDraft) =>
  draft.versions
    .filter(
      (v) =>
        v.timeWindow &&
        Number.isFinite(milestoneDay(v.timeWindow.start)) &&
        v.timeWindow.start <= v.timeWindow.end
    )
    .toSorted((a, b) => a.timeWindow!.start.localeCompare(b.timeWindow!.start))

export function latestMilestoneMonth(draft: MilestoneDraft, today = milestoneToday()) {
  return (
    [
      ...draft.material.months.map((m) => m.month),
      ...datedMilestoneVersions(draft).map((v) => v.timeWindow!.start.slice(0, 7))
    ]
      .sort()
      .at(-1) ?? today.slice(0, 7)
  )
}
const monthDay = (month: string, offset = 0) => {
  const date = new Date(`${month}-01T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + offset)
  return date.getTime() / 86400000
}
export function milestoneWeekAt(day: number): MilestoneWeek {
  const monday = Math.floor(day) - ((new Date(Math.floor(day) * 86400000).getUTCDay() + 6) % 7)
  return { start: milestoneDate(monday), end: milestoneDate(monday + 4) }
}
export function milestoneCalendar(draft: MilestoneDraft, today = milestoneToday()) {
  const focus = latestMilestoneMonth(draft, today)
  const versions = datedMilestoneVersions(draft)
  const first = Math.min(
    monthDay(focus, -1),
    ...versions.map((v) => milestoneDay(v.timeWindow!.start)),
    ...draft.material.months.map((m) => monthDay(m.month))
  )
  const start = milestoneDay(milestoneWeekAt(first).start)
  const last =
    Math.max(monthDay(focus, 2) - 1, ...versions.map((v) => milestoneDay(v.timeWindow!.end))) + 7
  const weeks: MilestoneWeek[] = []
  for (let day = start; day <= last; day += 7) {
    weeks.push(milestoneWeekAt(day))
  }
  return { start, end: start + weeks.length * 7 - 1, weeks, versions }
}
export function versionInMilestoneWeek(draft: MilestoneDraft, week: MilestoneWeek) {
  return datedMilestoneVersions(draft).findLast(
    (v) => v.timeWindow!.start <= week.end && v.timeWindow!.end >= week.start
  )
}
/** Previewing a week never creates materials; commit this result with the user's edit as one step. */
export function materializeMilestoneWeek(
  draft: MilestoneDraft,
  week: MilestoneWeek,
  cycleId: string,
  name?: string
) {
  const existing = versionInMilestoneWeek(draft, week)
  if (existing) {
    return { draft, version: existing }
  }
  let version = name?.trim()
  if (!version) {
    const last = datedMilestoneVersions(draft).at(-1)?.version ?? draft.versions.at(-1)?.version
    const suffix = last?.match(/^(.*?)(\d+)$/)
    const match = suffix && Number.isSafeInteger(Number(suffix[2]) + 2001) ? suffix : null
    const prefix = match?.[1] ?? 'v1.0.'
    let number = match ? Number(match[2]) + 1 : 0
    do {
      version = `${prefix}${number++}`
    } while (draft.versions.some((v) => v.version.toLowerCase() === version!.toLowerCase()))
  }
  const next: ScheduledVersion = { version, cycleId, timeWindow: { ...week } }
  const month = week.start.slice(0, 7)
  return {
    version: next,
    draft: {
      ...draft,
      versions: [...draft.versions, next],
      material: {
        ...draft.material,
        months: draft.material.months.some((m) => m.month === month)
          ? draft.material.months
          : [...draft.material.months, { month, outcome: '' }]
      }
    }
  }
}
