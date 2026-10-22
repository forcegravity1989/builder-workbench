import {
  AcceptanceMaterialSchema,
  PlanningMaterialSchema,
  type AcceptanceMaterial,
  type PlanningMaterial
} from '../../../../shared/workbench/version-material'
import {
  acceptanceGoalSnapshot,
  acceptanceRoundState
} from '../../../../shared/workbench/acceptance-rounds'

export type PlanReference = AcceptanceMaterial['planRef']
export type CandidateReference = NonNullable<AcceptanceMaterial['candidateRef']>
export type PreparedArtifact = AcceptanceMaterial['preparedArtifacts'][number]
export type GoalResult = AcceptanceMaterial['results'][number]
export type EvidenceCheck =
  | { kind: 'verified'; checkedAt: string }
  | { kind: 'unknown' | 'mismatch' | 'unavailable'; reason: string }

export function sameAcceptanceSource(left: AcceptanceMaterial, right: AcceptanceMaterial): boolean {
  const leftRounds = acceptanceRoundState(left)
  const rightRounds = acceptanceRoundState(right)
  return (
    leftRounds.kind !== 'conflict' &&
    rightRounds.kind !== 'conflict' &&
    JSON.stringify(leftRounds.rounds.toSorted((a, b) => a.id.localeCompare(b.id))) ===
      JSON.stringify(rightRounds.rounds.toSorted((a, b) => a.id.localeCompare(b.id))) &&
    left.version === right.version &&
    left.cycleId === right.cycleId &&
    JSON.stringify(left.planRef) === JSON.stringify(right.planRef) &&
    JSON.stringify(left.candidateRef) === JSON.stringify(right.candidateRef)
  )
}

export function sameCandidate(left: CandidateReference, right: CandidateReference): boolean {
  return (
    left.repository === right.repository &&
    left.version === right.version &&
    left.commit === right.commit
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

/** A material round can span multiple native sessions while keeping its fixed promise. */
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

export function emptyGoalResult(goalId: string, document?: AcceptanceMaterial): GoalResult {
  const result: GoalResult = { goalId, deliveries: [], readings: [], note: '', nextStep: '' }
  const current = document && acceptanceRoundState(document).current
  return current
    ? { ...result, rounds: [{ ...current, snapshot: acceptanceGoalSnapshot(result) }] }
    : result
}

export function artifactCandidateCheck(
  artifact: PreparedArtifact,
  candidate: CandidateReference | undefined
): EvidenceCheck {
  if (!candidate) {
    return { kind: 'unknown', reason: '尚未固定源码候选' }
  }
  if (!sameCandidate(artifact.candidateRef, candidate)) {
    return { kind: 'mismatch', reason: '材料属于另一候选，请重新准备或核对适用范围' }
  }
  // Matching declarations do not prove the command ran or the artifact is available.
  return { kind: 'unknown', reason: '候选标识一致，材料来源与可用性待核对' }
}
