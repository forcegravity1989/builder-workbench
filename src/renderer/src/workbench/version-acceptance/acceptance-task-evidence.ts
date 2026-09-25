import {
  VersionTaskSnapshotSchema,
  type AcceptanceMaterial,
  type PlanningMaterial,
  type VersionTaskReference,
  type VersionTaskSnapshot
} from '../../../../shared/workbench/version-material'
import type { CycleTaskRead } from '../version-cycle/ports'

export function taskReferenceKey(reference: VersionTaskReference): string {
  return JSON.stringify([reference.provider, reference.repository, reference.number])
}

export function captureTaskSnapshot(reads: CycleTaskRead[]): VersionTaskSnapshot[] {
  return reads.map((item) =>
    VersionTaskSnapshotSchema.parse(
      item.kind === 'ready'
        ? { kind: 'ready', ...item.task, reference: item.reference }
        : {
            kind: 'unavailable',
            reference: item.reference,
            error: item.error,
            readAt: item.readAt,
            source: item.source
          }
    )
  )
}

/** Goal membership comes from the fixed plan, never from an independently editable snapshot. */
export function goalTaskEvidence(
  document: AcceptanceMaterial,
  plan: PlanningMaterial,
  goalId: string
) {
  return plan.tasks
    .filter((reference) => reference.goalId === goalId)
    .map((reference) => {
      const matches = document.taskSnapshot?.filter(
        (item) => taskReferenceKey(item.reference) === taskReferenceKey(reference)
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
