import type {
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import { emptyGoalResult, type GoalResult } from './acceptance-model'
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

/** Round navigation metadata and the judgment itself are not business evidence. */
export function goalEvidenceText(
  document: AcceptanceMaterial,
  plan: PlanningMaterial,
  goalId: string
): string {
  return evidenceText(document, plan, goalId, false)
}

function evidenceText(
  document: AcceptanceMaterial,
  plan: PlanningMaterial,
  goalId: string,
  includeRounds: boolean
): string {
  const goal = plan.goals.find((item) => item.goalId === goalId)
  if (!goal) {
    throw new Error('该目标不属于固定计划')
  }
  const {
    decision: _decision,
    rounds,
    ...evidence
  } = document.results.find((item) => item.goalId === goalId) ?? emptyGoalResult(goalId)
  const result = includeRounds ? { ...evidence, rounds } : evidence
  const locations = new Set(result.deliveries.map((item) => item.location).filter(Boolean))
  const candidatePackages = document.preparedArtifacts
    .filter((item) => item.kind === 'package')
    .sort((a, b) => (a.artifactId < b.artifactId ? -1 : a.artifactId > b.artifactId ? 1 : 0))
  const artifacts = document.preparedArtifacts
    .filter((item) => item.kind !== 'package' && locations.has(item.location))
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
      candidatePackages,
      goal,
      result,
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
  return evidenceRevision(goalEvidenceText(document, plan, goalId))
}

async function evidenceRevision(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return `sha256:${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export type DecisionFreshness = 'unrecorded' | 'current' | 'changed'

/** Freshness is independent from whether the cited human source has been verified. */
export async function decisionFreshness(
  document: AcceptanceMaterial,
  plan: PlanningMaterial,
  goalId: string
): Promise<DecisionFreshness> {
  const decision = document.results.find((item) => item.goalId === goalId)?.decision
  if (!decision) {
    return 'unrecorded'
  }
  if (decision.materialRevision === (await goalEvidenceRevision(document, plan, goalId))) {
    return 'current'
  }
  // Existing decisions used the complete projection including rounds; accept only an exact match.
  return decision.materialRevision ===
    (await evidenceRevision(evidenceText(document, plan, goalId, true)))
    ? 'current'
    : 'changed'
}

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
    emptyGoalResult(input.goalId, input.document)
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
    results: input.document.results.some((item) => item.goalId === input.goalId)
      ? input.document.results.map((item) => (item.goalId === input.goalId ? next : item))
      : [...input.document.results, next]
  }
}
