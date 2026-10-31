import { milestoneDay, milestoneDate } from './milestone-calendar'
import type { MilestoneDraft } from './project-milestones'

/** Move only unused, unstarted windows; a drag never reschedules someone else's work. */
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
  let shifted = false
  for (const direction of [1, -1] as const) {
    const traversal = direction === 1 ? ordered : ordered.toReversed()
    const reach: { start: string; end: string }[] = []
    const action = direction === 1 ? '顺延' : '前移'
    for (const [index, version] of traversal.entries()) {
      const window = windows.get(version.cycleId)!
      const old = original.get(version.cycleId)?.timeWindow
      if (moving.has(version.cycleId)) {
        if (!old || (direction === 1 ? window.end > old.end : window.start < old.start)) {
          reach.push(window)
        }
        continue
      }
      if (occupied.has(version.cycleId)) {
        continue
      }
      const collisions = reach.filter((r) => r.start <= window.end && window.start <= r.end)
      if (!collisions.length) {
        continue
      }
      if (started.has(version.cycleId)) {
        return {
          draft: before,
          conflict: `${version.version} 已开始，不能${action}，请调整当前排期`
        }
      }
      const delta =
        direction === 1
          ? Math.max(...collisions.map((r) => milestoneDay(r.end))) + 1 - milestoneDay(window.start)
          : Math.min(...collisions.map((r) => milestoneDay(r.start))) - 1 - milestoneDay(window.end)
      const next = {
        start: milestoneDate(milestoneDay(window.start) + delta),
        end: milestoneDate(milestoneDay(window.end) + delta)
      }
      // Check the swept interval so a large drag cannot jump an empty window past fixed work.
      const blocked = traversal.slice(index + 1).find((v) => {
        if (!started.has(v.cycleId) && !occupied.has(v.cycleId)) {
          return false
        }
        const fixed = windows.get(v.cycleId)!
        return direction === 1
          ? fixed.start <= next.end && window.start <= fixed.end
          : fixed.start <= window.end && next.start <= fixed.end
      })
      if (blocked) {
        return {
          draft: before,
          conflict: `${version.version} ${action}会与 ${blocked.version} 重叠，请先调整相邻排期`
        }
      }
      windows.set(version.cycleId, next)
      reach.push(next)
      shifted = true
    }
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
