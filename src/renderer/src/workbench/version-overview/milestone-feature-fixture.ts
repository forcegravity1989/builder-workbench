import type { CycleTaskSnapshot } from '../version-cycle/ports'
import type { MilestoneMaterial } from '../../../../shared/workbench/project-milestones'

const delivery = {
  id: 'delivery',
  phase: 'Build' as const,
  timeWindow: { start: '2026-09-29T00:00', end: '2026-10-06T00:00' }
}
const plannedMaintenance = {
  ...delivery,
  id: 'later',
  phase: 'Maintain' as const,
  timeWindow: { start: '2026-10-08T00:00', end: '2026-11-06T12:00' }
}
export const milestoneMaterial: MilestoneMaterial = {
  schema_version: 4,
  milestones: [],
  features: [
    {
      id: 'planned',
      title: ' 项目墙 ',
      owner: 'builder',
      deliveries: [delivery, plannedMaintenance]
    }
  ]
}

export function milestoneSibling<T extends { root: CycleTaskSnapshot }>(feature: T) {
  return {
    ...feature,
    root: { ...feature.root, reference: { ...feature.root.reference, number: 440 }, iid: 440 }
  }
}
