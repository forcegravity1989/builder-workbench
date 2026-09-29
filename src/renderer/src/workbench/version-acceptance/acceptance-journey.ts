import type {
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import {
  archiveJourneyLamp,
  isArchivedMaterial,
  type ArchivedMaterial,
  type ArchiveStatus
} from '../../../../shared/workbench/version-archive'
import type { CandidateCheck, ArtifactCheck } from './acceptance-candidate-port'
import type { DecisionFreshness } from './acceptance-decision'
import { artifactCandidateCheck, type EvidenceCheck } from './acceptance-model'

export type JourneySignal = { kind: 'unknown' | 'pending' | 'failed' | 'complete'; label: string }
export type PreparationChecks = { candidate: CandidateCheck; artifacts: ArtifactCheck[] }

function hasDeliveryEvidence(result: AcceptanceMaterial['results'][number]): boolean {
  return result.deliveries.some((item) => item.title.trim() || item.location.trim())
}

/**
 * The preparation lamp derives from recorded evidence only — the retired
 * "materials complete" checkbox no longer gates it, and machine checks stay
 * honest: unknown is unknown, never green. Completeness is measured against
 * the fixed plan's goals: a material round missing goal results is
 * schema-valid, so checking only the present results could turn green while
 * planned goals still lack any delivery.
 */
export function preparationSignal(
  document: AcceptanceMaterial | undefined,
  plan: EvidenceCheck,
  checks: PreparationChecks | null,
  planGoals?: PlanningMaterial['goals'] | null
): JourneySignal {
  if (!document) {
    return { kind: 'unknown', label: '未开始' }
  }
  if (plan.kind === 'mismatch' || plan.kind === 'unavailable') {
    return { kind: 'failed', label: '原承诺核对失败' }
  }
  if (
    (document.candidateRef && document.candidateRef.version !== document.version) ||
    document.preparedArtifacts.some(
      (item) => artifactCandidateCheck(item, document.candidateRef).kind === 'mismatch'
    )
  ) {
    return { kind: 'failed', label: '候选不匹配' }
  }
  const evidence: EvidenceCheck[] = checks
    ? [
        plan,
        checks.candidate,
        ...checks.artifacts.flatMap((item) => [item.candidate, item.availability])
      ]
    : [plan]
  if (evidence.some((item) => item.kind === 'mismatch' || item.kind === 'unavailable')) {
    return { kind: 'failed', label: '来源核对失败' }
  }
  const evidenceFor = (goalId: string) => {
    const result = document.results.find((item) => item.goalId === goalId)
    return result !== undefined && hasDeliveryEvidence(result)
  }
  if (planGoals && planGoals.length > 0 && planGoals.every((goal) => evidenceFor(goal.goalId))) {
    return { kind: 'complete', label: '实际交付已记录' }
  }
  if (document.results.some(hasDeliveryEvidence) || document.preparedArtifacts.length > 0) {
    return { kind: 'pending', label: '材料待补齐' }
  }
  return { kind: 'unknown', label: '未开始' }
}

export function decisionSignal(
  document: AcceptanceMaterial | undefined,
  plan: PlanningMaterial | undefined,
  decisions: Record<string, DecisionFreshness> | null
): JourneySignal {
  if (
    !document ||
    !plan ||
    !plan.goals.length ||
    !plan.goals.some((goal) =>
      document.results.some((item) => item.goalId === goal.goalId && item.decision)
    )
  ) {
    return { kind: 'unknown', label: '未验收' }
  }
  const outcomes = plan.goals.map((goal) => ({
    decision: document.results.find((item) => item.goalId === goal.goalId)?.decision,
    freshness: decisions?.[goal.goalId]
  }))
  if (
    outcomes.some((item) => item.freshness === 'current' && item.decision?.outcome === 'not-met')
  ) {
    return { kind: 'failed', label: '存在未达' }
  }
  if (outcomes.every((item) => item.freshness === 'current' && item.decision?.outcome === 'met')) {
    return { kind: 'complete', label: '已确认达成' }
  }
  return { kind: 'pending', label: '待核对' }
}

/** Host truth for the saved revision; a stale local dirty draft cannot un-archive or bypass it. */
export function archiveSignal(
  status: ArchiveStatus,
  material: ArchivedMaterial | null
): JourneySignal {
  const archived = Boolean(material && isArchivedMaterial(status, material))
  switch (archiveJourneyLamp(status, archived)) {
    case 'complete':
      return { kind: 'complete', label: '已归档' }
    case 'unknown':
      return { kind: 'unknown', label: status.kind === 'unknown' ? '状态未知' : '未创建' }
    case 'failed':
      return { kind: 'failed', label: '归档待处理' }
    case 'pending':
      return { kind: 'pending', label: status.kind === 'merged' ? '当前材料待核对' : '待评审' }
  }
}
