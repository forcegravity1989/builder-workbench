import type { MetricScope } from '../../../../shared/workbench/metrics'
import type { VersionHistoryPort } from '../../../../shared/workbench/version-history'
import {
  AcceptanceMaterialSchema,
  PlanningMaterialSchema,
  PlanningProgressSourceSchema,
  type AcceptanceMaterial,
  type PlanningMaterial,
  type PlanningProgressSource
} from '../../../../shared/workbench/version-material'

/** The fixed acceptance record plus the plan it adopted, both identity-verified. */
type PlanningProgressSourceDocuments = {
  acceptance: AcceptanceMaterial
  plan: PlanningMaterial
}

/**
 * Reads the referenced acceptance record at its fixed commit together with the
 * plan it adopted, for the prior-review rows. Identity mismatches throw —
 * never fall back to another record or to the latest material.
 */
export async function readPlanningProgressSource(
  history: VersionHistoryPort,
  scope: MetricScope,
  input: PlanningProgressSource
): Promise<PlanningProgressSourceDocuments> {
  const source = PlanningProgressSourceSchema.parse(input)
  const snapshot = await history.read({
    scope,
    version: source.version,
    cycleId: source.cycleId,
    sourceCommit: source.sourceCommit,
    expectedRevision: source.revision,
    workflow: 'acceptance'
  })
  const document = AcceptanceMaterialSchema.parse(snapshot.document)
  if (
    snapshot.sourceCommit !== source.sourceCommit ||
    snapshot.revision !== source.revision ||
    document.version !== source.version ||
    document.cycleId !== source.cycleId
  ) {
    throw new Error('验收来源的版本、周期身份、来源提交或修订不一致，未改读其他记录。')
  }
  const fixed = await history.readPlan({ scope, planRef: document.planRef })
  const plan = PlanningMaterialSchema.parse(fixed.document)
  if (
    fixed.revision !== document.planRef.revision ||
    plan.version !== document.planRef.version ||
    plan.cycleId !== document.planRef.cycleId
  ) {
    throw new Error('无法核对该验收采用的固定计划，未改读最新计划。')
  }
  return { acceptance: document, plan }
}
