import type {
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import { emptyGoalResult, upsertGoalResult, type GoalResult } from './acceptance-model'
import { goalTaskEvidence } from './acceptance-task-evidence'

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, stableValue(item)])
    )
  }
  return value
}

/**
 * The projection a human verdict cites. The verdict itself is excluded, and so is
 * round navigation metadata — rounds are retired, and neither was ever business
 * evidence. The board renders no staleness state from this: the revision is a
 * ledger field, and whether evidence moved is for the model to raise in session.
 */
function goalEvidenceText(
  document: AcceptanceMaterial,
  plan: PlanningMaterial,
  goalId: string
): string {
  const goal = plan.goals.find((item) => item.goalId === goalId)
  if (!goal) {
    throw new Error('该目标不属于固定计划')
  }
  const { decision: _decision, ...evidence } =
    document.results.find((item) => item.goalId === goalId) ?? emptyGoalResult(goalId)
  const candidatePackages = document.preparedArtifacts
    .filter((item) => item.kind === 'package')
    .sort((a, b) => (a.artifactId < b.artifactId ? -1 : a.artifactId > b.artifactId ? 1 : 0))
  const artifacts = document.preparedArtifacts
    .filter((item) => item.kind !== 'package')
    .sort((a, b) => (a.artifactId < b.artifactId ? -1 : a.artifactId > b.artifactId ? 1 : 0))
  const tasks = goalTaskEvidence(document, plan, goalId).map((item) => ({
    ...item,
    snapshots: item.snapshots.map(stableValue).sort((a, b) => {
      const left = JSON.stringify(a)
      const right = JSON.stringify(b)
      return left < right ? -1 : left > right ? 1 : 0
    })
  }))
  return JSON.stringify(
    stableValue({
      version: document.version,
      cycleId: document.cycleId,
      planRef: document.planRef,
      candidateRef: document.candidateRef ?? null,
      demoEnv: document.demoEnv ?? null,
      candidatePackages,
      goal,
      result: evidence,
      artifacts,
      tasks
    })
  )
}

export async function goalEvidenceRevision(
  document: AcceptanceMaterial,
  plan: PlanningMaterial,
  goalId: string
): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(goalEvidenceText(document, plan, goalId))
  )
  return `sha256:${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Records a human verdict. The row-end pair collects no reason text: the note is
 * the goal's free-text field and the durable account of an unmet goal lives in
 * the minutes, its next step and the Issue notes.
 */
export async function recordHumanDecision(input: {
  document: AcceptanceMaterial
  plan: PlanningMaterial
  goalId: string
  outcome: NonNullable<GoalResult['decision']>['outcome']
  source: string
  reason: string
  recordedAt: string
}): Promise<AcceptanceMaterial> {
  if (!input.source.trim()) {
    throw new Error('请注明判断人或人的确认来源')
  }
  const result =
    input.document.results.find((item) => item.goalId === input.goalId) ??
    emptyGoalResult(input.goalId)
  const next = {
    ...result,
    decision: {
      outcome: input.outcome,
      source: input.source.trim(),
      reason: input.reason,
      recordedAt: input.recordedAt,
      materialRevision: await goalEvidenceRevision(input.document, input.plan, input.goalId)
    }
  }
  return {
    ...input.document,
    results: upsertGoalResult(input.document.results, next)
  }
}
