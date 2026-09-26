import type {
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import {
  isArchivedMaterial,
  type ArchivedMaterial,
  type ArchiveStatus
} from '../../../../shared/workbench/version-archive'
import type { CandidateCheck, ArtifactCheck } from './acceptance-candidate-port'
import type { DecisionFreshness } from './acceptance-decision'
import { artifactCandidateCheck, type EvidenceCheck } from './acceptance-model'

export type JourneySignal = { kind: 'unknown' | 'pending' | 'failed' | 'complete'; label: string }
export type PreparationChecks = { candidate: CandidateCheck; artifacts: ArtifactCheck[] }

export function preparationSignal(
  document: AcceptanceMaterial | undefined,
  plan: EvidenceCheck,
  checks: PreparationChecks | null,
  humanReviewed = false
): JourneySignal {
  if (!document) {
    return { kind: 'unknown', label: '未开始' }
  }
  if (plan.kind === 'mismatch' || plan.kind === 'unavailable') {
    return { kind: 'failed', label: '原承诺核对失败' }
  }
  if (
    !humanReviewed &&
    !document.preparationReview &&
    !document.candidateRef &&
    !document.preparedArtifacts.length
  ) {
    return { kind: 'unknown', label: '未开始' }
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
  if (humanReviewed) {
    return { kind: 'complete', label: '材料已备齐' }
  }
  return { kind: 'pending', label: '材料待核对' }
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
  if (material && isArchivedMaterial(status, material)) {
    return { kind: 'complete', label: '已归档' }
  }
  if (status.kind === 'unknown' || status.kind === 'not-created') {
    return { kind: 'unknown', label: status.kind === 'unknown' ? '状态未知' : '未创建' }
  }
  if (
    status.kind === 'closed' ||
    status.checks === 'failed' ||
    status.review === 'changes-requested'
  ) {
    return { kind: 'failed', label: '归档待处理' }
  }
  return { kind: 'pending', label: status.kind === 'merged' ? '当前材料待核对' : '待评审' }
}
