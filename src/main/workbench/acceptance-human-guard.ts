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
  return changes
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
