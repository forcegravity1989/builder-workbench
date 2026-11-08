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
    if (!registered)
      return { draft: { ...draft, versions: draft.versions.filter((v) => v.cycleId !== cycleId) } }
    name = commit.previousName || registered.version
    problem = '该版本已提交，不能通过清空名称移除'
  }
  return {
    problem,
    draft: {
      ...draft,
      versions: draft.versions.map((v) => (v.cycleId === cycleId ? { ...v, version: name } : v))
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

export function milestoneWeekAt(day: number): MilestoneWeek {
  const monday = Math.floor(day) - ((new Date(Math.floor(day) * 86400000).getUTCDay() + 6) % 7)
  return { start: milestoneDate(monday), end: milestoneDate(monday + 4) }
}
const firstCivilDay = milestoneDay('0000-01-01')
const lastCivilDay = milestoneDay('9999-12-31')
const mondayAt = (day: number) => day - ((new Date(day * 86400000).getUTCDay() + 6) % 7)
export const withinCivilRange = (day: number) =>
  Math.max(firstCivilDay, Math.min(lastCivilDay, day))

export function milestoneCalendar(
  draft: MilestoneDraft,
  today = milestoneToday(),
  location: { date?: string } = {}
) {
  const requested = location.date ? milestoneDay(location.date) : milestoneDay(today) - 10
  const focusDay = withinCivilRange(
    Number.isFinite(requested) ? requested : milestoneDay(today) - 10
  )
  // A bounded moving window keeps distant plans on the same daily scale without mounting years of cells.
  const start = withinCivilRange(mondayAt(focusDay - 180)),
    end = withinCivilRange(focusDay + 365)
  const weeks: MilestoneWeek[] = []
  for (let day = mondayAt(start); day <= end; day += 7) {
    if (day + 4 >= start)
      weeks.push({
        start: milestoneDate(withinCivilRange(day)),
        end: milestoneDate(withinCivilRange(day + 4))
      })
  }
  return {
    start,
    end,
    weeks,
    versions: datedMilestoneVersions(draft),
    focusDay,
    year: milestoneDate(focusDay).slice(0, 4)
  }
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
