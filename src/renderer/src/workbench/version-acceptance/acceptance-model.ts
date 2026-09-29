import {
  AcceptanceMaterialSchema,
  PlanningMaterialSchema,
  type AcceptanceMaterial,
  type PlanningMaterial
} from '../../../../shared/workbench/version-material'
import { taskReferenceKey } from './acceptance-task-evidence'

export type PlanReference = AcceptanceMaterial['planRef']
export type CandidateReference = NonNullable<AcceptanceMaterial['candidateRef']>
export type PreparedArtifact = AcceptanceMaterial['preparedArtifacts'][number]
export type GoalResult = AcceptanceMaterial['results'][number]
export type EvidenceCheck =
  | { kind: 'verified'; checkedAt: string }
  | { kind: 'unknown' | 'mismatch' | 'unavailable'; reason: string }

export function sameAcceptanceSource(left: AcceptanceMaterial, right: AcceptanceMaterial): boolean {
  return (
    left.version === right.version &&
    left.cycleId === right.cycleId &&
    JSON.stringify(left.planRef) === JSON.stringify(right.planRef) &&
    JSON.stringify(left.candidateRef) === JSON.stringify(right.candidateRef)
  )
}

export function preparationKey(document: AcceptanceMaterial): string {
  return JSON.stringify([
    document.version,
    document.cycleId,
    document.candidateRef,
    document.preparedArtifacts
  ])
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

export function emptyGoalResult(goalId: string): GoalResult {
  return { goalId, deliveries: [], readings: [], note: '', nextStep: '' }
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

export function acceptanceSourceProblems(
  document: AcceptanceMaterial,
  plan: PlanningMaterial
): string[] {
  const problems: string[] = []
  if (
    document.version !== plan.version ||
    document.planRef.version !== plan.version ||
    document.planRef.cycleId !== plan.cycleId
  ) {
    problems.push('验收与固定计划的版本或周期不一致')
  }
  if (document.candidateRef && document.candidateRef.version !== document.version) {
    problems.push('源码候选与验收版本不一致')
  }
  const goalIds = new Set(plan.goals.map((goal) => goal.goalId))
  for (const result of document.results) {
    if (!goalIds.has(result.goalId)) {
      problems.push(`结果 ${result.goalId} 不属于固定计划，请核对来源`)
    }
  }
  if (document.taskSnapshot) {
    const captured = new Set(document.taskSnapshot.map((item) => taskReferenceKey(item.reference)))
    for (const task of plan.tasks) {
      if (!captured.has(taskReferenceKey(task))) {
        problems.push(`固定计划的 ${task.repository} #${task.number} 尚无状态快照`)
      }
    }
  }
  return problems
}
