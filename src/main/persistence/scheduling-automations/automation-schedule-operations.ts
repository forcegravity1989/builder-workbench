import type { Automation } from '../../../shared/automations-types'
import type { PersistedState } from '../../../shared/persisted-state-types'
import {
  latestAutomationOccurrenceAtOrBefore,
  nextAutomationOccurrenceAfter
} from '../../../shared/automation-schedule-occurrences'

export function advanceAutomationNextRun(
  state: PersistedState,
  flush: () => void,
  id: string,
  now = Date.now()
): Automation {
  const index = (state.automations ?? []).findIndex((entry) => entry.id === id)
  if (index === -1) {
    throw new Error('Automation not found.')
  }
  const current = state.automations[index]
  const nextRunAt = nextAutomationOccurrenceAfter(current.rrule, current.dtstart, now)
  const updated = { ...current, nextRunAt, updatedAt: now }
  // Replaced, not patched in place: the list projection caches on array identity.
  state.automations = state.automations.map((entry) => (entry.id === id ? updated : entry))
  flush()
  return updated
}

export function getLatestAutomationOccurrence(
  automation: Automation,
  now = Date.now()
): number | null {
  return latestAutomationOccurrenceAtOrBefore(automation.rrule, automation.dtstart, now)
}

/** 实际派发记账：scheduledRunCount 是持久正本（历史会被保留策略裁剪，不能从
 *  runs 数）。只在真实派发点调用；跳过/错过/手动不累计。 */
export function recordAutomationScheduledDispatch(
  state: PersistedState,
  flush: () => void,
  id: string,
  now = Date.now()
): void {
  const index = (state.automations ?? []).findIndex((entry) => entry.id === id)
  if (index === -1) {
    return
  }
  // Replaced, not patched in place: the list projection caches on array identity.
  state.automations = (state.automations ?? []).map((entry) =>
    entry.id === id
      ? { ...entry, scheduledRunCount: (entry.scheduledRunCount ?? 0) + 1, updatedAt: now }
      : entry
  )
  flush()
}
