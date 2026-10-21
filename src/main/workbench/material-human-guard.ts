import { isDeepStrictEqual } from 'node:util'
import {
  AcceptanceMaterialSchema,
  PlanningMaterialSchema,
  type AcceptanceMaterial,
  type VersionMaterial
} from '../../shared/workbench/version-material'
import type {
  VersionMaterialRead,
  VersionMaterialSave
} from '../../shared/workbench/version-material-request'
import { WorkspaceScopeError } from './workspace-scope-error'
import type { VersionHistoryPort } from '../../shared/workbench/version-history'
import { analyzeAcceptanceRounds } from './material-round-guard'

/** An omitted commit is resolved to the cycle worktree HEAD on the owning runtime. */
export type AcceptanceRoundSourceReader = (
  input: Omit<Parameters<VersionHistoryPort['read']>[0], 'sourceCommit'> & { sourceCommit?: string }
) => ReturnType<VersionHistoryPort['read']>

/** Caller identity as seen by the RPC dispatcher; never taken from the request payload. */
export type MaterialSaveCaller = {
  clientKind?: 'mobile' | 'runtime'
}

/**
 * Channel boundary for human-only material fields: acceptance conclusions and
 * current-round inputs (decision, delivery, progress, next step, Issue notes/
 * marks and confirmed guidance), plus preparationReview, the planning risk
 * report (summary.risks) and the planning meeting-minutes confirmation and
 * followup closure marks (minutes.confirmed/confirmedAt, followups[].closed).
 * Desktop IPC and paired device sockets arrive with an authenticated clientKind;
 * the local Unix-socket CLI — the channel in-session models execute — arrives
 * without one. A human typing `bw materials save` by hand is refused too:
 * these fields are recorded in the BW UI, the CLI channel round-trips them unchanged.
 */
export function isModelSaveChannel(caller: MaterialSaveCaller): boolean {
  return caller.clientKind === undefined
}

function json(value: unknown): string {
  return JSON.stringify(value ?? null)
}

function hasHumanValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false
  }
  if (typeof value === 'string') {
    return value.trim().length > 0
  }
  if (Array.isArray(value)) {
    return value.length > 0
  }
  if (typeof value === 'object') {
    return Object.keys(value).length > 0
  }
  return true
}

function compareHumanField(
  changes: string[],
  path: string,
  current: unknown,
  incoming: unknown
): void {
  if (json(current) === json(incoming)) {
    return
  }
  // A newly created result may carry the empty fields required by schema3.
  // Non-empty human input on a model-created result is still refused.
  if (!hasHumanValue(current) && !hasHumanValue(incoming)) {
    return
  }
  changes.push(path)
}

function directiveChanges(
  changes: string[],
  goalId: string,
  current: AcceptanceMaterial['results'][number]['meetingDirectives'],
  incoming: AcceptanceMaterial['results'][number]['meetingDirectives']
): void {
  const currentById = new Map((current ?? []).map((directive) => [directive.id, directive]))
  const incomingById = new Map((incoming ?? []).map((directive) => [directive.id, directive]))
  for (const [directiveId, currentDirective] of currentById) {
    const incomingDirective = incomingById.get(directiveId)
    if (!incomingDirective) {
      changes.push(`results[${goalId}].meetingDirectives[${directiveId}]`)
      continue
    }
    if (
      currentDirective.status === 'confirmed' &&
      json(currentDirective) !== json(incomingDirective)
    ) {
      changes.push(`results[${goalId}].meetingDirectives[${directiveId}]`)
      continue
    }
    if (currentDirective.text !== incomingDirective.text) {
      changes.push(`results[${goalId}].meetingDirectives[${directiveId}].text`)
    }
    if (
      currentDirective.source !== incomingDirective.source ||
      currentDirective.sourceRef !== incomingDirective.sourceRef
    ) {
      changes.push(`results[${goalId}].meetingDirectives[${directiveId}].source`)
    }
    const statusChanged = currentDirective.status !== incomingDirective.status
    const confirmedAtChanged = currentDirective.confirmedAt !== incomingDirective.confirmedAt
    if (
      statusChanged &&
      (currentDirective.status === 'confirmed' || incomingDirective.status === 'confirmed')
    ) {
      changes.push(`results[${goalId}].meetingDirectives[${directiveId}].status`)
    }
    if (
      confirmedAtChanged &&
      (currentDirective.status === 'confirmed' ||
        incomingDirective.status === 'confirmed' ||
        currentDirective.confirmedAt !== undefined ||
        incomingDirective.confirmedAt !== undefined)
    ) {
      changes.push(`results[${goalId}].meetingDirectives[${directiveId}].confirmedAt`)
    }
  }
  for (const [directiveId, incomingDirective] of incomingById) {
    if (currentById.has(directiveId)) {
      continue
    }
    // Models may propose new pending guidance, but cannot create a confirmed
    // human decision (or a timestamp that implies one).
    if (
      incomingDirective.status !== 'pending' ||
      incomingDirective.confirmedAt !== undefined ||
      !incomingDirective.sourceRef?.trim() ||
      (incomingDirective.source !== 'transcript-summary' &&
        !(
          incomingDirective.source === 'manual' &&
          /^conversation:\S/.test(incomingDirective.sourceRef)
        ))
    ) {
      changes.push(`results[${goalId}].meetingDirectives[${directiveId}].status`)
    }
  }
}

/** Names the human-only fields the incoming document would add, change or drop. */
export function humanFieldChanges(
  current: AcceptanceMaterial | null,
  incoming: AcceptanceMaterial
): string[] {
  const rounds = analyzeAcceptanceRounds(current, incoming)
  const changes: string[] = [...rounds.changes]
  compareHumanField(
    changes,
    'preparationReview',
    current?.preparationReview,
    incoming.preparationReview
  )
  const currentByGoal = new Map((current?.results ?? []).map((item) => [item.goalId, item]))
  const incomingByGoal = new Map(incoming.results.map((item) => [item.goalId, item]))
  for (const goalId of new Set([...currentByGoal.keys(), ...incomingByGoal.keys()])) {
    const currentResult = currentByGoal.get(goalId)
    const incomingResult = incomingByGoal.get(goalId)
    const currentDecision = currentResult?.decision
    const incomingDecision = incomingResult?.decision
    if (!(rounds.rollover && incomingDecision === undefined)) {
      compareHumanField(changes, `results[${goalId}].decision`, currentDecision, incomingDecision)
    }
    compareHumanField(
      changes,
      `results[${goalId}].actualDelivery`,
      currentResult?.deliveries,
      incomingResult?.deliveries
    )
    compareHumanField(
      changes,
      `results[${goalId}].nextStep`,
      currentResult?.nextStep,
      incomingResult?.nextStep
    )
    compareHumanField(
      changes,
      `results[${goalId}].progress`,
      currentResult?.progress,
      incomingResult?.progress
    )
    compareHumanField(changes, `results[${goalId}].note`, currentResult?.note, incomingResult?.note)
    compareHumanField(
      changes,
      `results[${goalId}].issueNotes`,
      currentResult?.issueNotes,
      incomingResult?.issueNotes
    )
    compareHumanField(
      changes,
      `results[${goalId}].issueMarks`,
      currentResult?.issueMarks,
      incomingResult?.issueMarks
    )
    directiveChanges(
      changes,
      goalId,
      currentResult?.meetingDirectives,
      incomingResult?.meetingDirectives
    )
  }
  return changes
}

import { planHumanFieldChanges } from './plan-human-guard'

/**
 * Save-channel guard: model-channel saves must not touch human conclusions, but must
 * stay able to round-trip them unchanged. The authoritative check runs here on the
 * owning runtime; the CLI client cannot be trusted to enforce it.
 */
export async function assertHumanFieldsUntouched(
  read: (input: VersionMaterialRead) => Promise<{ document: VersionMaterial } | null>,
  params: VersionMaterialSave,
  caller: MaterialSaveCaller,
  readRoundSource?: AcceptanceRoundSourceReader
): Promise<void> {
  if (!isModelSaveChannel(caller) && params.workflow !== 'acceptance') {
    return
  }
  // The read schema is strict; save-only fields cannot enter the read scope.
  const { expectedRevision: _expectedRevision, document: _document, ...readInput } = params
  const stored = (await read(readInput))?.document
  if (params.workflow === 'plan') {
    const current = stored ? PlanningMaterialSchema.parse(stored) : null
    const changes = planHumanFieldChanges(current, PlanningMaterialSchema.parse(params.document))
    if (changes.length > 0) {
      throw new WorkspaceScopeError(
        'forbidden',
        `计划人工字段不符合保存规则（${changes.join('、')}）：风险上报由用户在计划界面填写；会议纪要的人工确认与遗留闭环由人标记，确认后整节冻结，模型通道只能在未确认时撰写纪要正文或原样往返`
      )
    }
    return
  }
  if (params.workflow !== 'acceptance') {
    return
  }
  const current = stored ? AcceptanceMaterialSchema.parse(stored) : null
  const incoming = AcceptanceMaterialSchema.parse(params.document)
  const rounds = analyzeAcceptanceRounds(current, incoming)
  const changes = isModelSaveChannel(caller) ? humanFieldChanges(current, incoming) : rounds.changes
  if (changes.length > 0) {
    throw new WorkspaceScopeError(
      'forbidden',
      `验收人工字段或轮次记录不符合保存规则（${changes.join('、')}）；人的输入请在界面记录，封存与新周在会话核对后处理`
    )
  }
  const sources: { sourceCommit?: string; sourceRevision?: string }[] = rounds.requiresHeadSource
    ? [{}]
    : rounds.sources
  for (const source of sources) {
    if (!current || !readRoundSource) {
      throw new WorkspaceScopeError(
        'forbidden',
        '封存验收轮次必须先提交当前完整材料并核对 Git 来源'
      )
    }
    if (current.planRef.kind !== 'committed') {
      throw new WorkspaceScopeError(
        'forbidden',
        '封存前须提交并固定计划修订，草稿计划不能作为历史整页来源'
      )
    }
    const frozen = await readRoundSource({
      scope: { repoId: params.repoId, worktreeId: params.worktreeId, hostId: params.hostId },
      source: 'cycle',
      sourceCommit: source.sourceCommit,
      expectedRevision: source.sourceRevision,
      version: current.version,
      cycleId: current.cycleId,
      workflow: 'acceptance'
    })
    if (
      (source.sourceCommit !== undefined && frozen.sourceCommit !== source.sourceCommit) ||
      (source.sourceRevision !== undefined && frozen.revision !== source.sourceRevision) ||
      !isDeepStrictEqual(frozen.document, current)
    ) {
      throw new WorkspaceScopeError(
        'forbidden',
        '轮次 Git 来源与当前已保存材料不一致，请保存并提交最新材料后重试'
      )
    }
  }
}
