import type { MilestoneDraft, ScheduledVersion } from '../../../shared/workbench/project-milestones'
import { newFeatureMilestoneVersions } from '../../../shared/workbench/milestone-calendar'
import { defaultMilestoneStages } from '../../../shared/workbench/milestone-sdlc'

export function createMilestoneFeature(
  draft: MilestoneDraft,
  registered: readonly ScheduledVersion[] = []
) {
  const selected = newFeatureMilestoneVersions(draft, undefined, registered)
  const id = crypto.randomUUID(),
    date = selected.first.timeWindow!.start,
    month = date.slice(0, 7)
  return {
    id,
    date,
    draft: {
      ...selected.draft,
      material: {
        ...selected.draft.material,
        features: [
          {
            id,
            month,
            title: '',
            owner: '',
            deliveries: [selected.first, selected.next].map((v, index) => ({
              id: crypto.randomUUID(),
              version: { version: v.version, cycleId: v.cycleId },
              stages: defaultMilestoneStages(v, index === 1)
            }))
          },
          ...draft.material.features
        ]
      }
    }
  }
}
