import { milestoneVersionConflict, type MilestoneDraft } from './project-milestones'

export function settleMilestoneWindows(
  before: MilestoneDraft,
  candidate: MilestoneDraft
): { draft: MilestoneDraft; conflict?: string } {
  const conflict = milestoneVersionConflict(candidate.versions, before.versions)
  return { draft: conflict ? before : candidate, conflict }
}
