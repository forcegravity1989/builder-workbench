import {
  VersionTaskSnapshotSchema,
  type AcceptanceMaterial,
  type VersionTaskReference,
  type VersionTaskSnapshot
} from '../../../../shared/workbench/version-material'
import { issueSnapshotMatches } from './acceptance-issue-annotations'
import type { CycleTaskRead } from '../version-cycle/ports'

function taskReferenceKey(reference: VersionTaskReference): string {
  return JSON.stringify([reference.provider, reference.repository, reference.number])
}

export function replaceGoalTaskEvidence(
  current: AcceptanceMaterial['taskSnapshot'],
  goalId: string,
  replacement: AcceptanceMaterial['taskSnapshot']
): AcceptanceMaterial['taskSnapshot'] {
  if (!current && !replacement) {
    return undefined
  }
  return [
    ...(current ?? []).filter((item) => item.reference.goalId !== goalId),
    ...(replacement ?? []).filter((item) => item.reference.goalId === goalId)
  ]
}

export function acceptedIssueEvidence(
  acceptance: Pick<AcceptanceMaterial, 'results' | 'taskSnapshot'>
): VersionTaskSnapshot[] {
  const decidedGoals = new Set(
    acceptance.results.filter((result) => result.decision).map((result) => result.goalId)
  )
  return (
    acceptance.taskSnapshot?.filter(
      (item) => item.reference.goalId && decidedGoals.has(item.reference.goalId)
    ) ?? []
  )
}

export function captureTaskSnapshot(reads: CycleTaskRead[]): VersionTaskSnapshot[] {
  return reads.map((item) => {
    const { kind: _kind, ...reference } = item.reference
    return VersionTaskSnapshotSchema.parse(
      item.kind === 'ready'
        ? { kind: 'ready', ...item.task, reference }
        : {
            kind: 'unavailable',
            reference,
            error: item.error,
            readAt: item.readAt,
            source: item.source
          }
    )
  })
}

/** References are the provider membership for the goal at decision time. */
export function goalTaskEvidence(
  document: AcceptanceMaterial,
  references: readonly VersionTaskReference[],
  goalId: string
) {
  return references
    .filter((reference) => reference.goalId === goalId)
    .map((reference) => {
      const matches = document.taskSnapshot?.filter(
        (item) =>
          item.reference.goalId === reference.goalId && issueSnapshotMatches(item, reference)
      )
      return {
        reference,
        status:
          document.taskSnapshot === undefined
            ? 'unrecorded'
            : matches?.length
              ? 'recorded'
              : 'missing',
        snapshots: (matches ?? []).map(
          ({ readAt: _readAt, reference: _reference, ...facts }) => facts
        )
      }
    })
    .sort((a, b) => {
      const left = taskReferenceKey(a.reference)
      const right = taskReferenceKey(b.reference)
      return left < right ? -1 : left > right ? 1 : 0
    })
}
