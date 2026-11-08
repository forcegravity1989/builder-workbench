import type { MilestoneDraft } from '../../../shared/workbench/project-milestones'
import {
  milestoneDay,
  milestoneDate,
  milestoneToday
} from '../../../shared/workbench/milestone-calendar'
import { newMilestoneDelivery } from '../../../shared/workbench/milestone-sdlc'

export function createMilestoneFeature(draft: MilestoneDraft, viewDate = milestoneToday()) {
  const start = Math.max(milestoneDay(milestoneToday()), milestoneDay(viewDate)),
    id = crypto.randomUUID()
  const build = newMilestoneDelivery('Build', start),
    maintain = newMilestoneDelivery('Maintain', start + 7)
  if (!build || !maintain) return null
  return {
    id,
    date: milestoneDate(start),
    draft: {
      ...draft,
      material: {
        ...draft.material,
        features: [
          {
            id,
            title: '',
            owner: '',
            deliveries: [build, maintain]
          },
          ...draft.material.features
        ]
      }
    }
  }
}
