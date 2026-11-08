import type { MilestoneDraft, ScheduledVersion } from './project-milestones'

export function settleMilestoneWindows(
  before: MilestoneDraft,
  candidate: MilestoneDraft
): { draft: MilestoneDraft; conflict?: string } {
  const conflict = milestoneVersionConflict(candidate.versions, before.versions)
  return { draft: conflict ? before : candidate, conflict }
}

export function milestoneVersionConflict(
  versions: readonly ScheduledVersion[],
  previous: readonly ScheduledVersion[] = []
): string | undefined {
  const prior = new Map(previous.map((v) => [v.cycleId, v.timeWindow]))
  const dated = versions
    .filter((v) => v.timeWindow)
    .toSorted((a, b) => a.timeWindow!.start.localeCompare(b.timeWindow!.start))
  for (const [index, a] of dated.entries()) {
    for (const b of dated.slice(index + 1)) {
      if (b.timeWindow!.start > a.timeWindow!.end) {
        break
      }
      const oldA = prior.get(a.cycleId),
        oldB = prior.get(b.cycleId)
      const start = b.timeWindow!.start,
        end = [a.timeWindow!.end, b.timeWindow!.end].sort()[0]
      // Existing parallel dates may remain or shrink; unrelated edits must not rewrite history.
      if (
        oldA &&
        oldB &&
        start >= oldA.start &&
        start >= oldB.start &&
        end <= oldA.end &&
        end <= oldB.end
      ) {
        continue
      }
      return `${a.version} 与 ${b.version} 日期重叠，请调整相关版本`
    }
  }
  return undefined
}
