import { isDeepStrictEqual } from 'node:util'
import type { AcceptanceMaterial } from '../../shared/workbench/version-material'
import {
  acceptanceGoalSnapshot,
  acceptanceRoundState
} from '../../shared/workbench/acceptance-rounds'

function roundIndependentMaterial(document: AcceptanceMaterial, rollover = false) {
  return {
    ...document,
    workflow: rollover ? undefined : document.workflow,
    results: document.results
      .map(({ decision, rounds: _rounds, ...result }) => ({
        ...result,
        ...(!rollover && decision ? { decision } : {})
      }))
      .sort((left, right) => left.goalId.localeCompare(right.goalId))
  }
}

function unchangedRounds(current: AcceptanceMaterial, incoming: AcceptanceMaterial): boolean {
  const next = new Map(incoming.results.map((result) => [result.goalId, result.rounds]))
  return (
    current.results.length === incoming.results.length &&
    current.results.every(
      (result) =>
        next.has(result.goalId) && isDeepStrictEqual(result.rounds, next.get(result.goalId))
    )
  )
}

/** Only open IDs can be reconciled; their week/kind, closed history and human input stay intact. */
function reconcilesOpenIds(current: AcceptanceMaterial, incoming: AcceptanceMaterial): boolean {
  const state = acceptanceRoundState(incoming)
  if (
    state.kind !== 'ready' ||
    !state.current ||
    !isDeepStrictEqual(roundIndependentMaterial(current), roundIndependentMaterial(incoming))
  ) {
    return false
  }
  const next = new Map(incoming.results.map((result) => [result.goalId, result]))
  return current.results.every((result) => {
    const oldOpen = (result.rounds ?? []).filter((round) => !round.closedAt)
    const nextResult = next.get(result.goalId)
    const nextOpen = nextResult?.rounds?.find((round) => !round.closedAt)
    return (
      oldOpen.length <= 1 &&
      nextOpen &&
      oldOpen.every((round) => round.week === nextOpen.week && round.kind === nextOpen.kind) &&
      isDeepStrictEqual(
        (result.rounds ?? []).filter((round) => round.closedAt),
        (nextResult?.rounds ?? []).filter((round) => round.closedAt)
      ) &&
      isDeepStrictEqual(nextOpen.snapshot, acceptanceGoalSnapshot(result))
    )
  })
}

/** A rollover freezes stored input before clearing the new round's decision and workflow. */
export function analyzeAcceptanceRounds(
  current: AcceptanceMaterial | null,
  incoming: AcceptanceMaterial
) {
  const changes: string[] = []
  const before = current ? acceptanceRoundState(current) : null
  const after = acceptanceRoundState(incoming)
  if (
    current &&
    before?.kind === 'conflict' &&
    (unchangedRounds(current, incoming) || reconcilesOpenIds(current, incoming))
  ) {
    return { changes, rollover: false, sources: [], requiresHeadSource: false }
  }
  const oldRounds = new Map(before?.rounds.map((round) => [round.id, round]))
  const closedNow = after.rounds.filter(
    (round) => round.closedAt && !oldRounds.get(round.id)?.closedAt
  )
  const continuesClosedHistory = Boolean(
    before?.kind === 'ready' &&
    !before.current &&
    before.rounds.length > 0 &&
    closedNow.length === 0
  )
  const rolloverCandidate = Boolean(
    current &&
    before?.kind !== 'conflict' &&
    after.kind !== 'conflict' &&
    after.current &&
    !oldRounds.has(after.current.id) &&
    (closedNow.length === 1 || continuesClosedHistory)
  )
  if (after.kind === 'conflict' || before?.kind === 'conflict' || closedNow.length > 1) {
    changes.push('results[].rounds')
  }
  const currentByGoal = new Map(current?.results.map((result) => [result.goalId, result]))
  const incomingByGoal = new Map(incoming.results.map((result) => [result.goalId, result]))
  for (const goalId of new Set([...currentByGoal.keys(), ...incomingByGoal.keys()])) {
    const previous = currentByGoal.get(goalId)
    const next = incomingByGoal.get(goalId)
    const previousRounds = new Map(previous?.rounds?.map((round) => [round.id, round]))
    const nextRounds = new Map(next?.rounds?.map((round) => [round.id, round]))
    const reject = (roundId: string) => changes.push(`results[${goalId}].rounds[${roundId}]`)
    if ((next?.rounds ?? []).filter((round) => !round.closedAt).length > 1) {
      changes.push(`results[${goalId}].rounds`)
    }
    for (const [id, old] of previousRounds) {
      const value = nextRounds.get(id)
      if (isDeepStrictEqual(old, value)) {
        continue
      }
      const validClosure =
        previous &&
        value &&
        !old.closedAt &&
        value.closedAt &&
        value.week === old.week &&
        value.kind === old.kind &&
        value.sourceCommit &&
        value.sourceRevision &&
        isDeepStrictEqual(value.snapshot, acceptanceGoalSnapshot(previous))
      if (!validClosure) {
        reject(id)
      }
    }
    for (const [id, value] of nextRounds) {
      if (previousRounds.has(id)) {
        continue
      }
      const source = previous ?? next!
      if (value.closedAt) {
        // A material without an explicit current round still needs a real Git
        // source before its implicit round can be sealed.
        if (
          !previous ||
          before?.kind !== 'legacy' ||
          !value.sourceCommit ||
          !value.sourceRevision ||
          !isDeepStrictEqual(value.snapshot, acceptanceGoalSnapshot(previous))
        ) {
          reject(id)
        }
      } else {
        const joinsCurrent = !previous && id === before?.current?.id
        // The first UI edit may add a result and change its current inputs in
        // one save; its round snapshot still describes the empty initial state.
        const emptyInitial = joinsCurrent
          ? acceptanceGoalSnapshot({
              goalId,
              deliveries: [],
              readings: [],
              note: '',
              nextStep: ''
            })
          : undefined
        if (
          (before?.current && !joinsCurrent && !nextRounds.get(before.current.id)?.closedAt) ||
          (!isDeepStrictEqual(value.snapshot, acceptanceGoalSnapshot(source, rolloverCandidate)) &&
            !isDeepStrictEqual(value.snapshot, emptyInitial))
        ) {
          reject(id)
        }
      }
    }
    for (const round of closedNow) {
      if (!nextRounds.has(round.id)) {
        reject(round.id)
      }
    }
  }
  const rollover = Boolean(
    rolloverCandidate &&
    changes.length === 0 &&
    current &&
    incoming.workflow === undefined &&
    incoming.results.every((result) => result.decision === undefined) &&
    isDeepStrictEqual(
      roundIndependentMaterial(current, true),
      roundIndependentMaterial(incoming, true)
    )
  )
  if (rolloverCandidate && !rollover) {
    changes.push('results[].rounds')
  }
  return {
    changes,
    rollover,
    requiresHeadSource: rollover && continuesClosedHistory,
    sources: closedNow.flatMap((round) =>
      round.sourceCommit && round.sourceRevision
        ? [{ sourceCommit: round.sourceCommit, sourceRevision: round.sourceRevision }]
        : []
    )
  }
}
