import type { AcceptanceMaterial } from './version-acceptance-material'
import type { AcceptanceRound } from './version-material-common'

export type AcceptanceRoundIdentity = Omit<AcceptanceRound, 'snapshot'>
export type AcceptanceRoundState = {
  kind: 'legacy' | 'ready' | 'conflict'
  current: AcceptanceRoundIdentity | null
  rounds: AcceptanceRoundIdentity[]
  reason?: string
}

/** A round is a version-wide identity, never whichever goal was edited last. */
export function acceptanceRoundState(document: AcceptanceMaterial): AcceptanceRoundState {
  const records = new Map<string, AcceptanceRoundIdentity>()
  const openGoals = new Set<string>()
  const openIds = new Set<string>()
  const conflict = (): AcceptanceRoundState => ({
    kind: 'conflict',
    current: null,
    rounds: [],
    reason: '各目标的验收轮次不一致，请在会话中核对材料；未按目标顺序推断当前周。'
  })
  for (const result of document.results) {
    const open = (result.rounds ?? []).filter((round) => !round.closedAt)
    if (open.length > 1) {
      return conflict()
    }
    for (const round of result.rounds ?? []) {
      const identity = {
        id: round.id,
        week: round.week,
        kind: round.kind,
        closedAt: round.closedAt,
        sourceCommit: round.sourceCommit,
        sourceRevision: round.sourceRevision
      }
      const previous = records.get(round.id)
      if (previous && JSON.stringify(previous) !== JSON.stringify(identity)) {
        return conflict()
      }
      records.set(round.id, identity)
      if (!round.closedAt) {
        openIds.add(round.id)
        openGoals.add(result.goalId)
      }
    }
  }
  if (openIds.size > 1 || (openIds.size === 1 && openGoals.size !== document.results.length)) {
    return conflict()
  }
  const rounds = [...records.values()]
  return {
    kind: rounds.length ? 'ready' : 'legacy',
    current: rounds.find((round) => !round.closedAt) ?? null,
    rounds
  }
}

/** The compact fallback preserves only the human fields the old protocol recorded. */
export function acceptanceGoalSnapshot(
  result: AcceptanceMaterial['results'][number],
  pending = false
): AcceptanceRound['snapshot'] {
  return {
    goals: [
      {
        goalId: result.goalId,
        decision: pending ? 'pending' : (result.decision?.outcome ?? 'pending'),
        progress: result.progress?.trim() ? result.progress : '',
        ...(result.nextStep?.trim() ? { next: result.nextStep } : {})
      }
    ],
    issueMarks: result.issueMarks ?? {},
    issueNotes: result.issueNotes ?? {}
  }
}
