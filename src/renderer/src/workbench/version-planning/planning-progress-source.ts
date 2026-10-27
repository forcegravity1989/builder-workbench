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

/** The prior acceptance record plus the plan it adopted, both identity-verified. */
type PlanningProgressSourceDocuments = {
  acceptance: AcceptanceMaterial
  plan: PlanningMaterial
}

/** The legacy v0.7.x four-field pin, narrowed from the all-or-none schema refine. */
type PinnedProgressSource = {
  version: string
  cycleId: string
  sourceCommit: string
  revision: string
}

/**
 * Newest merged acceptance record for the version — the final copy on the
 * adopted baseline, which is all the plan screen ever needs; the history list
 * has already collapsed each round's intermediate commits. A newer unreadable
 * round is a failure, never silently skipped for an older one.
 */
async function deriveNewestMergedAcceptance(
  history: VersionHistoryPort,
  scope: MetricScope,
  version: string
) {
  const catalog = await history.list({ scope, version, workflow: 'acceptance' })
  const newestRecord = catalog.records[0]
  const newestProblem = catalog.problems[0]
  if (
    !newestRecord ||
    (newestProblem && Date.parse(newestProblem.committedAt) >= Date.parse(newestRecord.committedAt))
  ) {
    if (newestProblem) {
      throw new Error(
        `上版 ${version} 最新合入的验收记录无法读取：${newestProblem.message}；未改读更早记录。`
      )
    }
    throw new Error(
      `上版 ${version} 的验收记录尚未合入项目基线分支，请先更新代码再重试；未改读其他版本或最新材料。`
    )
  }
  return history.read({
    scope,
    version: newestRecord.version,
    cycleId: newestRecord.cycleId,
    sourceCommit: newestRecord.sourceCommit,
    expectedRevision: newestRecord.revision,
    workflow: 'acceptance'
  })
}

/** Reads the acceptance's adopted plan and verifies its identity against planRef. */
async function adoptAcceptancePlan(
  history: VersionHistoryPort,
  scope: MetricScope,
  document: AcceptanceMaterial
): Promise<PlanningMaterial> {
  const fixed = await history.readPlan({ scope, planRef: document.planRef })
  const plan = PlanningMaterialSchema.parse(fixed.document)
  if (
    fixed.revision !== document.planRef.revision ||
    plan.version !== document.planRef.version ||
    plan.cycleId !== document.planRef.cycleId
  ) {
    throw new Error('无法核对该验收采用的固定计划，未改读最新计划。')
  }
  return plan
}

/** Legacy read: the exact pinned record, every identity field round-tripped. */
async function readPinnedProgressSource(
  history: VersionHistoryPort,
  scope: MetricScope,
  source: PinnedProgressSource
): Promise<PlanningProgressSourceDocuments> {
  const snapshot = await history.read({
    scope,
    version: source.version,
    cycleId: source.cycleId,
    sourceCommit: source.sourceCommit,
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
  return { acceptance: document, plan: await adoptAcceptancePlan(history, scope, document) }
}

/**
 * Derived read: the newest merged record for the version from the adopted
 * baseline. The record came from the version-filtered baseline walk, so a
 * version mismatch means the catalog lied — fail rather than show another
 * version's record.
 */
async function readDerivedProgressSource(
  history: VersionHistoryPort,
  scope: MetricScope,
  version: string
): Promise<PlanningProgressSourceDocuments> {
  const snapshot = await deriveNewestMergedAcceptance(history, scope, version)
  const document = AcceptanceMaterialSchema.parse(snapshot.document)
  if (document.version !== version) {
    throw new Error('推导到的验收记录版本与请求不一致，未改读其他记录。')
  }
  return { acceptance: document, plan: await adoptAcceptancePlan(history, scope, document) }
}

/**
 * Reads the prior acceptance record together with the plan it adopted, for the
 * prior-review rows. Version-only sources derive the newest merged record for
 * the version from the adopted baseline; legacy v0.7.x four-field pins keep
 * the fixed-commit read. Identity mismatches throw — never fall back to
 * another record, an earlier round, or the latest material.
 */
export async function readPlanningProgressSource(
  history: VersionHistoryPort,
  scope: MetricScope,
  input: PlanningProgressSource
): Promise<PlanningProgressSourceDocuments> {
  const source = PlanningProgressSourceSchema.parse(input)
  if (
    source.sourceCommit !== undefined &&
    source.cycleId !== undefined &&
    source.revision !== undefined
  ) {
    return readPinnedProgressSource(history, scope, {
      version: source.version,
      cycleId: source.cycleId,
      sourceCommit: source.sourceCommit,
      revision: source.revision
    })
  }
  return readDerivedProgressSource(history, scope, source.version)
}
