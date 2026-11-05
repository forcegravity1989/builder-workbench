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
      ...draft.material.milestones.map((m) => m.date?.slice(0, 7) ?? m.month!),
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
const firstCivilDay = milestoneDay('0000-01-01')
const lastCivilDay = milestoneDay('9999-12-31')
const mondayAt = (day: number) => day - ((new Date(day * 86400000).getUTCDay() + 6) % 7)
const withinCivilRange = (day: number) => Math.max(firstCivilDay, Math.min(lastCivilDay, day))

export function milestoneCalendar(
  draft: MilestoneDraft,
  today = milestoneToday(),
  actual: readonly ScheduledVersion[] = [],
  location: { date?: string; offset?: number } = {}
) {
  const focus = latestMilestoneMonth(draft, today)
  const versions = datedMilestoneVersions(draft)
  const dates = draft.material.milestones.map((m) => m.date ?? `${m.month}-01`)
  for (const version of [...versions, ...actual]) {
    if (version.timeWindow) {
      dates.push(version.timeWindow.start, version.timeWindow.end)
    }
  }
  const anchors = dates.map(milestoneDay)
  const first = withinCivilRange(mondayAt(Math.min(monthDay(focus, -1), ...anchors)))
  const last = withinCivilRange(mondayAt(Math.max(monthDay(focus, 2) - 1, ...anchors) + 7) + 6)
  const requested = location.date
    ? milestoneDay(location.date)
    : location.offset !== undefined
      ? first + Math.floor(location.offset)
      : monthDay(focus)
  const focusDay = Math.max(first, Math.min(last, requested))
  const year = milestoneDate(focusDay).slice(0, 4)
  const segmented = last - first + 1 > 732
  // Keep a continuous daily scale without mounting intervening years for distant material.
  const start = segmented ? Math.max(first, milestoneDay(`${year}-01-01`)) : first
  const end = segmented ? Math.min(last, milestoneDay(`${year}-12-31`)) : last
  const weeks: MilestoneWeek[] = []
  for (let day = mondayAt(start); day <= end; day += 7) {
    if (day + 4 < start) {
      continue
    }
    weeks.push({
      start: milestoneDate(withinCivilRange(day)),
      end: milestoneDate(withinCivilRange(day + 4))
    })
  }
  const yearTargets = new Map<string, string>()
  if (segmented) {
    // Prefer a recorded date over January when jumping to a year with project material.
    const candidates = [
      ...dates,
      milestoneDate(first),
      milestoneDate(last),
      milestoneDate(focusDay)
    ]
    for (const adjacent of [Number(year) - 1, Number(year) + 1]) {
      if (adjacent >= 0 && adjacent <= 9999) {
        candidates.push(`${String(adjacent).padStart(4, '0')}-01-01`)
      }
    }
    for (const date of candidates) {
      const day = milestoneDay(date),
        key = date.slice(0, 4)
      if (day >= first && day <= last && !yearTargets.has(key)) {
        yearTargets.set(key, date)
      }
    }
  }
  return { start, end, weeks, versions, first, focusDay, year, yearTargets }
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
  name?: string,
  registered: readonly ScheduledVersion[] = []
) {
  const candidates = availableMilestoneVersions(draft, registered)
  const existing =
    versionInMilestoneWeek(draft, week) ??
    versionInMilestoneWeek({ ...draft, versions: candidates }, week)
  if (existing) {
    return includeMilestoneVersion(draft, existing)
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
    } while (candidates.some((v) => v.version.toLowerCase() === version!.toLowerCase()))
  }
  const next: ScheduledVersion = { version, cycleId, timeWindow: { ...week } }
  return {
    version: next,
    draft: {
      ...draft,
      versions: [...draft.versions, next]
    }
  }
}

function createFreeMilestoneWeek(
  draft: MilestoneDraft,
  from: string,
  registered: readonly ScheduledVersion[]
) {
  let week = milestoneWeekAt(milestoneDay(from))
  if (week.end < from) {
    week = milestoneWeekAt(milestoneDay(week.start) + 7)
  }
  for (;;) {
    const blockers = datedMilestoneVersions({
      ...draft,
      versions: availableMilestoneVersions(draft, registered)
    }).filter((v) => v.timeWindow!.start <= week.end && v.timeWindow!.end >= week.start)
    if (!blockers.length) {
      return materializeMilestoneWeek(draft, week, crypto.randomUUID(), undefined, registered)
    }
    const last = Math.max(...blockers.map((v) => milestoneDay(v.timeWindow!.end)))
    week = milestoneWeekAt(milestoneDay(milestoneWeekAt(last).start) + 7)
  }
}

/** Formal versions are selectable without becoming roadmap commitments until used. */
export function availableMilestoneVersions(
  draft: MilestoneDraft,
  registered: readonly ScheduledVersion[]
) {
  return [...draft.versions, ...new Map(registered.map((v) => [v.cycleId, v])).values()].filter(
    (v, index, all) => all.findIndex((p) => p.cycleId === v.cycleId) === index
  )
}

export function includeMilestoneVersion(draft: MilestoneDraft, version: ScheduledVersion) {
  return {
    draft: draft.versions.some((v) => v.cycleId === version.cycleId)
      ? draft
      : {
          ...draft,
          versions: [
            ...draft.versions,
            {
              version: version.version,
              cycleId: version.cycleId,
              ...(version.timeWindow ? { timeWindow: { ...version.timeWindow } } : {})
            }
          ]
        },
    version
  }
}

export function nextMilestoneVersion(
  draft: MilestoneDraft,
  after: string,
  registered: readonly ScheduledVersion[] = []
) {
  const version = datedMilestoneVersions({
    ...draft,
    versions: availableMilestoneVersions(draft, registered)
  }).find((v) => v.timeWindow!.start > after)
  return version
    ? includeMilestoneVersion(draft, version)
    : createFreeMilestoneWeek(draft, milestoneDate(milestoneDay(after) + 1), registered)
}

export function newFeatureMilestoneVersions(
  draft: MilestoneDraft,
  from = milestoneToday(),
  registered: readonly ScheduledVersion[] = []
) {
  const ordered = datedMilestoneVersions({
    ...draft,
    versions: availableMilestoneVersions(draft, registered)
  })
  const current =
    ordered.find((v) => v.timeWindow!.start <= from && v.timeWindow!.end >= from) ??
    ordered.find((v) => v.timeWindow!.start > from)
  const first = current
    ? includeMilestoneVersion(draft, current)
    : createFreeMilestoneWeek(draft, from, registered)
  const second = nextMilestoneVersion(first.draft, first.version.timeWindow!.end, registered)
  return { draft: second.draft, first: first.version, next: second.version }
}
