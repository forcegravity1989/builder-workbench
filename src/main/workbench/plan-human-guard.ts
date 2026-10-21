import { isDeepStrictEqual } from 'node:util'
import type { PlanMeetingMinutes, PlanningMaterial } from '../../shared/workbench/version-material'

/**
 * Plan-side human fields: the risk report is typed by the user in the planning
 * UI, and the meeting minutes carry human-only marks. The model channel may
 * create a plan with empty risks and must round-trip existing risks unchanged.
 * For minutes it may draft the body only while unconfirmed; confirmation
 * (confirmed/confirmedAt) and followup closure marks (closed) round-trip by id,
 * and a confirmed section is frozen until a human revokes it in the UI.
 */
export function planHumanFieldChanges(
  current: PlanningMaterial | null,
  incoming: PlanningMaterial
): string[] {
  const changes: string[] = []
  const previous = current?.summary.risks ?? ''
  if (previous !== incoming.summary.risks) {
    changes.push('summary.risks')
  }
  planMinutesChanges(changes, current?.minutes, incoming.minutes)
  return changes
}

function planMinutesChanges(
  changes: string[],
  current: PlanMeetingMinutes | undefined,
  incoming: PlanMeetingMinutes | undefined
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
    // no human marks (confirmation timestamp or closed followups).
    if (current && (current.confirmedAt !== undefined || current.followups.some((f) => f.closed))) {
      changes.push('minutes.followups')
    }
    return
  }
  if (incoming.confirmed || incoming.confirmedAt !== undefined) {
    changes.push('minutes.confirmed')
  }
  const currentById = new Map((current?.followups ?? []).map((followup) => [followup.id, followup]))
  for (const followup of incoming.followups) {
    const previous = currentById.get(followup.id)
    // Closure is a human mark: existing entries round-trip it, new entries open.
    if (previous ? previous.closed !== followup.closed : followup.closed) {
      changes.push(`minutes.followups[${followup.id}].closed`)
    }
  }
  const incomingIds = new Set(incoming.followups.map((followup) => followup.id))
  for (const followup of current?.followups ?? []) {
    if (!incomingIds.has(followup.id) && followup.closed) {
      changes.push(`minutes.followups[${followup.id}].closed`)
    }
  }
}
