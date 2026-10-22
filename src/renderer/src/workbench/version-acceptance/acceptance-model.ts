import {
  AcceptanceMaterialSchema,
  PlanningMaterialSchema,
  type AcceptanceMaterial,
  type PlanningMaterial
} from '../../../../shared/workbench/version-material'

export type PlanReference = AcceptanceMaterial['planRef']
export type CandidateReference = NonNullable<AcceptanceMaterial['candidateRef']>
export type PreparedArtifact = AcceptanceMaterial['preparedArtifacts'][number]
export type GoalResult = AcceptanceMaterial['results'][number]

/**
 * Identity of the acceptance a human verdict binds to. Rounds are retired with
 * the cross-week scenario, so the source is the version, cycle, fixed plan
 * revision and candidate — nothing else.
 */
export function sameAcceptanceSource(left: AcceptanceMaterial, right: AcceptanceMaterial): boolean {
  return (
    left.version === right.version &&
    left.cycleId === right.cycleId &&
    JSON.stringify(left.planRef) === JSON.stringify(right.planRef) &&
    JSON.stringify(left.candidateRef) === JSON.stringify(right.candidateRef)
  )
}

export function assertFixedPlan(
  reference: PlanReference,
  snapshot: { document: PlanningMaterial; revision: string }
): PlanningMaterial {
  const plan = PlanningMaterialSchema.parse(snapshot.document)
  if (
    plan.version !== reference.version ||
    plan.cycleId !== reference.cycleId ||
    snapshot.revision !== reference.revision
  ) {
    throw new Error('计划来源已改变，请核对版本、周期与修订后明确选择；原验收草稿已保留。')
  }
  return plan
}

/** One version, one acceptance: the material spans the meeting without weekly rounds. */
export function createAcceptanceMaterial(input: {
  planRef: PlanReference
  plan: { document: PlanningMaterial; revision: string }
  cycleId: string
}): AcceptanceMaterial {
  const plan = assertFixedPlan(input.planRef, input.plan)
  return AcceptanceMaterialSchema.parse({
    schema_version: 3,
    version: plan.version,
    cycleId: input.cycleId,
    planRef: input.planRef,
    preparedArtifacts: [],
    results: plan.goals.map((goal) => emptyGoalResult(goal.goalId))
  })
}

export function emptyGoalResult(goalId: string): GoalResult {
  return { goalId, readings: [], note: '', nextStep: '' }
}

/**
 * The evidence report the board opens. One per version is the rule, but a
 * regenerated report can leave more than one registered; take the most recently
 * generated so the board never opens a superseded file without saying so.
 */
export function latestVerificationArtifact(
  document: AcceptanceMaterial
): PreparedArtifact | undefined {
  return document.preparedArtifacts
    .filter((item) => item.kind === 'verification')
    .reduce<PreparedArtifact | undefined>(
      (newest, item) =>
        !newest || item.generatedAt > newest.generatedAt ? item : newest,
      undefined
    )
}
