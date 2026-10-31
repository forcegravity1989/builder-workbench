import type { PlanningMaterial } from '../../../shared/workbench/version-material'
import type {
  MilestoneDelivery,
  MilestoneMaterial,
  MilestonePhase
} from '../../../shared/workbench/project-milestones'
import { plannedDay } from '../../../shared/workbench/milestone-sdlc'
import { taskKey, type FeatureData } from './version-overview/feature-model'

export type MilestoneVersionFacts = {
  plan: Pick<PlanningMaterial, 'version' | 'cycleId' | 'goals'> | null
  features: FeatureData[]
  loading: boolean
  failed: boolean
  stale: boolean
  readAt?: string
}
export const milestoneVersionKey = (version: { version: string; cycleId: string }) =>
  JSON.stringify([version.version, version.cycleId])

/** A planning slot or a partially read goal cannot establish a feature identity. */
export function matchMilestoneFeature(
  delivery: MilestoneDelivery,
  facts: MilestoneVersionFacts | undefined,
  material: MilestoneMaterial
): FeatureData | undefined {
  const plan = facts?.plan
  if (
    !plan ||
    (facts.failed && !facts.stale) ||
    plan.version !== delivery.version.version ||
    plan.cycleId !== delivery.version.cycleId ||
    !delivery.goalId ||
    !plan.goals.some((goal) => goal.goalId === delivery.goalId)
  ) {
    return undefined
  }
  const placements = material.features
    .flatMap((row) => row.deliveries)
    .filter(
      (other) =>
        milestoneVersionKey(other.version) === milestoneVersionKey(delivery.version) &&
        other.goalId === delivery.goalId
    )
  if (placements.length !== 1) {
    return undefined
  }
  const candidates = facts.features.filter((feature) =>
    feature.members.some((member) => member.reference.goalId === delivery.goalId)
  )
  return candidates.length === 1 ? candidates[0] : undefined
}

export type PlannedStageHours = Partial<Record<MilestonePhase, number>>

/** Only the unique formal planning row matched through this version's goal supplies widths. */
export function milestoneStageHours(
  material: MilestoneMaterial | undefined,
  facts: MilestoneVersionFacts,
  feature: FeatureData
): PlannedStageHours {
  if (!material) {
    return {}
  }
  const matches = material.features.flatMap((row) =>
    row.deliveries.flatMap((delivery, index) => {
      const matched = matchMilestoneFeature(delivery, facts, material)
      return matched && taskKey(matched.root.reference) === taskKey(feature.root.reference)
        ? [{ row, delivery, index }]
        : []
    })
  )
  if (matches.length !== 1) {
    return {}
  }
  const { row, delivery, index } = matches[0]!
  const stages = [...delivery.stages]
  if (!stages.some((stage) => stage.phase === 'Maintain')) {
    const next = row.deliveries
      .slice(index + 1)
      .find((item) => item.stages.some((stage) => stage.phase === 'Maintain'))
    stages.push(...(next?.stages.filter((stage) => stage.phase === 'Maintain') ?? []))
  }
  const result: PlannedStageHours = {}
  for (const stage of stages) {
    const hours = (plannedDay(stage.end) - plannedDay(stage.start)) * 24
    if (Number.isFinite(hours) && hours > 0) {
      result[stage.phase] = hours
    }
  }
  return result
}
