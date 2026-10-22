import { isDeepStrictEqual } from 'node:util'
import type {
  AcceptanceMaterial,
  AcceptanceMeetingMinutes
} from '../../shared/workbench/version-material'

/**
 * Acceptance-side human fields: the goal verdict and its note/next step, the
 * Issue-level note and carry mark, the preparation review, and the meeting
 * minutes. The model channel drafts the minutes body only while unconfirmed;
 * confirmation (confirmed/confirmedAt) is human-only and freezes the whole
 * section until a human revokes it in the UI. Unlike the plan side there is no
 * followup closure mark to round-trip — acceptance followups carry no closure.
 */
export function acceptanceHumanFieldChanges(
  current: AcceptanceMaterial | null,
  incoming: AcceptanceMaterial
): string[] {
  const changes: string[] = []
  // The draft pre-acceptance channel is retired: a model-channel save may not
  // create or repoint acceptance material at an uncommitted plan. Without this the
  // empty-board hard gate could be walked around from the CLI side.
  if (incoming.planRef.kind !== 'committed') {
    changes.push('planRef.kind(须为已提交计划)')
  }
  if (
    JSON.stringify(current?.preparationReview ?? null) !==
    JSON.stringify(incoming.preparationReview ?? null)
  ) {
    changes.push('preparationReview')
  }
  const currentByGoal = new Map((current?.results ?? []).map((item) => [item.goalId, item]))
  const incomingByGoal = new Map(incoming.results.map((item) => [item.goalId, item]))
  for (const goalId of new Set([...currentByGoal.keys(), ...incomingByGoal.keys()])) {
    const before = currentByGoal.get(goalId)
    const after = incomingByGoal.get(goalId)
    for (const field of ['decision', 'note', 'nextStep', 'issueNotes', 'issueMarks'] as const) {
      if (JSON.stringify(before?.[field] ?? null) !== JSON.stringify(after?.[field] ?? null)) {
        // A newly created result carries the empty fields schema3 requires; only
        // non-empty human input on a model-written result is a real change.
        if (hasHumanValue(before?.[field]) || hasHumanValue(after?.[field])) {
          changes.push(`results[${goalId}].${field}`)
        }
      }
    }
  }
  acceptanceMinutesChanges(changes, current?.minutes, incoming.minutes)
  legacyFieldChanges(changes, current, incoming)
  return changes
}

/**
 * Pre-v10 fields are read-only history: rounds, meeting directives, per-goal
 * deliveries and material links, the human progress text and risk marks. No v10
 * surface writes them, so any model-channel change is a rewrite of recorded
 * history and is refused — including "cleaning them up", which is a migration and
 * belongs to the session path with human confirmation.
 */
function legacyFieldChanges(
  changes: string[],
  current: AcceptanceMaterial | null,
  incoming: AcceptanceMaterial
): void {
  const currentByGoal = new Map((current?.results ?? []).map((item) => [item.goalId, item]))
  const incomingByGoal = new Map(incoming.results.map((item) => [item.goalId, item]))
  for (const goalId of new Set([...currentByGoal.keys(), ...incomingByGoal.keys()])) {
    const before = currentByGoal.get(goalId)
    const after = incomingByGoal.get(goalId)
    for (const field of [
      'rounds',
      'meetingDirectives',
      'deliveries',
      'materials',
      'progress'
    ] as const) {
      if (JSON.stringify(before?.[field] ?? null) !== JSON.stringify(after?.[field] ?? null)) {
        changes.push(`results[${goalId}].${field}(旧格式只读)`)
      }
    }
    const riskBefore = riskKeys(before?.issueMarks)
    const riskAfter = riskKeys(after?.issueMarks)
    if (riskBefore !== riskAfter) {
      changes.push(`results[${goalId}].issueMarks.risk(旧格式只读)`)
    }
  }
}

function riskKeys(marks: AcceptanceMaterial['results'][number]['issueMarks']): string {
  return JSON.stringify(
    Object.entries(marks ?? {})
      .filter(([, mark]) => mark.risk)
      .map(([key]) => key)
      .sort()
  )
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

function acceptanceMinutesChanges(
  changes: string[],
  current: AcceptanceMeetingMinutes | undefined,
  incoming: AcceptanceMeetingMinutes | undefined
): void {
  if (isDeepStrictEqual(current, incoming)) {
    return
  }
  if (current?.confirmed) {
    changes.push('minutes.confirmed')
    return
  }
  if (!incoming) {
    // Dropping the section rewrites the body away; only allowed while it carries
    // no human confirmation timestamp.
    if (current?.confirmedAt !== undefined) {
      changes.push('minutes.confirmedAt')
    }
    return
  }
  if (incoming.confirmed || incoming.confirmedAt !== undefined) {
    changes.push('minutes.confirmed')
  } else if (current?.confirmedAt !== undefined) {
    // A stored confirmation timestamp is a human mark even in odd legacy data;
    // the model channel must round-trip it, not silently drop it.
    changes.push('minutes.confirmedAt')
  }
}
