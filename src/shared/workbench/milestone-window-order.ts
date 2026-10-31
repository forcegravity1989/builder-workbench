import { milestoneDay, milestoneDate } from './milestone-calendar'
import type { MilestoneDraft } from './project-milestones'

/** Push only unused future windows; a drag never reschedules someone else's work. */
export function settleMilestoneWindows(
  before: MilestoneDraft,
  candidate: MilestoneDraft,
  started: ReadonlySet<string>
): { draft: MilestoneDraft; conflict?: string } {
  const original = new Map(before.versions.map((v) => [v.cycleId, v]))
  const occupied = new Set(
    candidate.material.features.flatMap((f) => f.deliveries.map((d) => d.version.cycleId))
  )
  const ordered = candidate.versions
    .filter((v) => v.timeWindow)
    .toSorted((a, b) => {
      const left = original.get(a.cycleId)?.timeWindow ?? a.timeWindow!
      const right = original.get(b.cycleId)?.timeWindow ?? b.timeWindow!
      return (
        left.start.localeCompare(right.start) ||
        left.end.localeCompare(right.end) ||
        a.cycleId.localeCompare(b.cycleId)
      )
    })
  const windows = new Map(ordered.map((v) => [v.cycleId, v.timeWindow!]))
  const moving = new Set(
    ordered
      .filter((v) => {
        const old = original.get(v.cycleId)?.timeWindow
        return !old || old.start !== v.timeWindow!.start || old.end !== v.timeWindow!.end
      })
      .map((v) => v.cycleId)
  )
  const reach: { index: number; start: string; end: string }[] = []
  let shifted = false
  for (const [index, version] of ordered.entries()) {
    const window = windows.get(version.cycleId)!
    const old = original.get(version.cycleId)?.timeWindow
    if (moving.has(version.cycleId)) {
      if (!old || window.end > old.end) {
        reach.push({ index, ...window })
      }
      continue
    }
    if (occupied.has(version.cycleId)) {
      continue
    }
    const collisions = reach.filter(
      (r) => r.index < index && r.start <= window.end && window.start <= r.end
    )
    if (!collisions.length) {
      continue
    }
    if (started.has(version.cycleId)) {
      return { draft: before, conflict: `${version.version} 已开始，不能顺延，请调整当前排期` }
    }
    const end = collisions.reduce((latest, r) => (r.end > latest ? r.end : latest), window.start)
    const delta = milestoneDay(end) + 1 - milestoneDay(window.start)
    const next = {
      start: milestoneDate(milestoneDay(window.start) + delta),
      end: milestoneDate(milestoneDay(window.end) + delta)
    }
    // Do not push an empty window through a later fixed version, even if the final windows would not overlap.
    const blocked = ordered.slice(index + 1).find((v) => {
      if (!started.has(v.cycleId) && !occupied.has(v.cycleId)) {
        return false
      }
      const fixed = windows.get(v.cycleId)!
      return fixed.start <= next.end && window.start <= fixed.end
    })
    if (blocked) {
      return {
        draft: before,
        conflict: `${version.version} 顺延会与 ${blocked.version} 重叠，请先调整后续排期`
      }
    }
    windows.set(version.cycleId, next)
    reach.push({ index, ...next })
    shifted = true
  }
  return {
    draft: shifted
      ? {
          ...candidate,
          versions: candidate.versions.map((v) => {
            const window = windows.get(v.cycleId)
            return window && window !== v.timeWindow ? { ...v, timeWindow: window } : v
          })
        }
      : candidate
  }
}
