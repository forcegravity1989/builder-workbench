import type {
  AcceptanceMaterial,
  PlanningMaterial,
  VersionMaterial
} from '../../shared/workbench/version-material'
import type {
  VersionMaterialRead,
  VersionMaterialSave
} from '../../shared/workbench/version-material-request'
import { WorkspaceScopeError } from './workspace-scope-error'

/** Caller identity as seen by the RPC dispatcher; never taken from the request payload. */
export type MaterialSaveCaller = {
  clientKind?: 'mobile' | 'runtime'
}

/**
 * Channel boundary for human-only material fields: acceptance conclusions and
 * current-round inputs (decision, delivery, progress, next step, Issue notes/
 * marks and confirmed guidance), plus preparationReview and the planning risk
 * report (summary.risks).
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

function roundChanges(
  changes: string[],
  goalId: string,
  currentResult: AcceptanceMaterial['results'][number] | undefined,
  current: AcceptanceMaterial['results'][number]['rounds'],
  incoming: AcceptanceMaterial['results'][number]['rounds']
): void {
  const currentById = new Map((current ?? []).map((round) => [round.id, round]))
  const incomingById = new Map((incoming ?? []).map((round) => [round.id, round]))
  for (const [roundId, currentRound] of currentById) {
    const incomingRound = incomingById.get(roundId)
    const closingOnly =
      incomingRound &&
      !currentRound.closedAt &&
      incomingRound.closedAt &&
      json(currentRound.snapshot) === json(incomingRound.snapshot) &&
      currentRound.week === incomingRound.week &&
      currentRound.kind === incomingRound.kind
    if (!incomingRound || (json(currentRound) !== json(incomingRound) && !closingOnly)) {
      changes.push(`results[${goalId}].rounds[${roundId}]`)
    }
  }
  const openRoundsClosed = (current ?? [])
    .filter((round) => !round.closedAt)
    .every((round) => incomingById.get(round.id)?.closedAt !== undefined)
  for (const [roundId, incomingRound] of incomingById) {
    if (currentById.has(roundId)) {
      continue
    }
    if (
      incomingRound.closedAt === undefined &&
      (current ?? []).some((round) => !round.closedAt) &&
      !openRoundsClosed
    ) {
      changes.push(`results[${goalId}].rounds[${roundId}]`)
      continue
    }
    // A model may open a new round only by snapshotting the already stored
    // human fields; it cannot manufacture a conclusion, note or mark in it.
    const expectedGoals = currentResult
      ? [
          {
            goalId: currentResult.goalId,
            decision: currentResult.decision?.outcome ?? 'pending',
            progress: currentResult.progress?.trim() ? currentResult.progress : '',
            ...(currentResult.nextStep?.trim() ? { next: currentResult.nextStep } : {})
          }
        ]
      : []
    const expectedSnapshot = {
      goals: expectedGoals,
      issueMarks: currentResult?.issueMarks ?? {},
      issueNotes: currentResult?.issueNotes ?? {}
    }
    if (json(incomingRound.snapshot) !== json(expectedSnapshot)) {
      changes.push(`results[${goalId}].rounds[${roundId}]`)
    }
  }
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
      incomingDirective.source !== 'transcript-summary' ||
      !incomingDirective.sourceRef?.trim()
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
  const changes: string[] = []
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
    compareHumanField(changes, `results[${goalId}].decision`, currentDecision, incomingDecision)
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
    roundChanges(changes, goalId, currentResult, currentResult?.rounds, incomingResult?.rounds)
    directiveChanges(
      changes,
      goalId,
      currentResult?.meetingDirectives,
      incomingResult?.meetingDirectives
    )
  }
  return changes
}

/**
 * Plan-side human field: the risk report is typed by the user in the planning
 * UI. The model channel may create a plan with empty risks and must round-trip
 * existing risks unchanged.
 */
export function planHumanFieldChanges(
  current: PlanningMaterial | null,
  incoming: PlanningMaterial
): string[] {
  const previous = current?.summary.risks ?? ''
  return previous === incoming.summary.risks ? [] : ['summary.risks']
}

/**
 * Save-channel guard: model-channel saves must not touch human conclusions, but must
 * stay able to round-trip them unchanged. The authoritative check runs here on the
 * owning runtime; the CLI client cannot be trusted to enforce it.
 */
export async function assertHumanFieldsUntouched(
  read: (input: VersionMaterialRead) => Promise<{ document: VersionMaterial } | null>,
  params: VersionMaterialSave,
  caller: MaterialSaveCaller
): Promise<void> {
  if (!isModelSaveChannel(caller)) {
    return
  }
  // The workflow store decodes with the matching material schema, so the stored
  // document for this scope carries that workflow's shape. The save params carry
  // expectedRevision/document on top of the read scope; the store's read path validates
  // with the strict VersionMaterialReadSchema, so strip the save-only keys first.
  const { expectedRevision: _expectedRevision, document: _document, ...readInput } = params
  if (params.workflow === 'plan') {
    const current = ((await read(readInput))?.document ?? null) as PlanningMaterial | null
    const changes = planHumanFieldChanges(current, params.document as PlanningMaterial)
    if (changes.length > 0) {
      throw new WorkspaceScopeError(
        'forbidden',
        `风险上报由用户在计划界面填写，模型通道不能写入或修改（${changes.join('、')}）；其余字段可照常保存`
      )
    }
    return
  }
  if (params.workflow !== 'acceptance') {
    return
  }
  const current = ((await read(readInput))?.document ?? null) as AcceptanceMaterial | null
  const changes = humanFieldChanges(current, params.document as AcceptanceMaterial)
  if (changes.length > 0) {
    throw new WorkspaceScopeError(
      'forbidden',
      `人工字段不能经 CLI 通道写入或修改（${changes.join('、')}）；请在验收界面由人记录，其余字段可照常保存`
    )
  }
}
