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

export function planReferenceIdentity(reference: PlanReference) {
  return reference.kind === 'committed'
    ? {
        kind: reference.kind,
        version: reference.version,
        cycleId: reference.cycleId,
        revision: reference.revision,
        sourceCommit: reference.sourceCommit
      }
    : {
        kind: reference.kind,
        version: reference.version,
        cycleId: reference.cycleId,
        revision: reference.revision,
        sourceWorktreeId: reference.sourceWorktreeId,
        sourceHostId: reference.sourceHostId
      }
}

export function candidateReferenceIdentity(reference: CandidateReference | null | undefined) {
  return reference
    ? {
        repository: reference.repository,
        version: reference.version,
        commit: reference.commit
      }
    : null
}

/**
 * Identity of the acceptance a human verdict binds to. Rounds are retired with
 * the cross-week scenario, so the source is the version, cycle, fixed plan
 * revision and candidate — nothing else.
 */
export function sameAcceptanceSource(left: AcceptanceMaterial, right: AcceptanceMaterial): boolean {
  return (
    left.version === right.version &&
    left.cycleId === right.cycleId &&
    JSON.stringify(planReferenceIdentity(left.planRef)) ===
      JSON.stringify(planReferenceIdentity(right.planRef)) &&
    JSON.stringify(candidateReferenceIdentity(left.candidateRef)) ===
      JSON.stringify(candidateReferenceIdentity(right.candidateRef))
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
 * Replace the matching goal's result, or append it when absent. One goal one
 * result is the material contract; every writer (row verdict, note/next-step
 * edit, decision record) goes through this so the append-vs-replace rule cannot
 * drift between call sites. Callers pass the base array they intend to patch —
 * the autosave path deliberately passes the freshly re-read controller value,
 * not the stale document it started from, to keep CAS semantics.
 */
export function upsertGoalResult(results: GoalResult[], result: GoalResult): GoalResult[] {
  return results.some((item) => item.goalId === result.goalId)
    ? results.map((item) => (item.goalId === result.goalId ? result : item))
    : [...results, result]
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
      (newest, item) => (!newest || item.generatedAt > newest.generatedAt ? item : newest),
      undefined
    )
}
