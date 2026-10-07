import { z } from 'zod'
import { MaterialRevision, MaterialVersion, SourceCommit } from './version-material'

/** CodeHub has no provider merge-commit channel; archive stays Unknown instead of a GitHub miss. */
export const CODEHUB_ARCHIVE_UNPROVABLE_REASON = 'CodeHub 合入证据暂无法读回，归档状态保持不可证明'

export const ArchiveReferenceSchema = z.strictObject({
  provider: z.string().min(1),
  repository: z.string().min(1),
  number: z.number().int().positive(),
  materialRevision: MaterialRevision
})
export type ArchiveReference = z.infer<typeof ArchiveReferenceSchema>
export const ArchivedMaterialSchema = z.strictObject({
  workflow: z.enum(['plan', 'acceptance']),
  version: MaterialVersion,
  cycleId: z.string().min(1),
  revision: MaterialRevision
})
export type ArchivedMaterial = z.infer<typeof ArchivedMaterialSchema>

/** Issued only after provider identity, merged state, merge commit and its file bytes are verified. */
export const ArchiveMergeProofSchema = z
  .strictObject({
    reference: ArchiveReferenceSchema,
    mergeCommit: SourceCommit,
    material: ArchivedMaterialSchema,
    checkedAt: z.iso.datetime({ offset: true })
  })
  .refine(
    (proof) => proof.reference.materialRevision === proof.material.revision,
    'Archive revisions differ'
  )
export type ArchiveMergeProof = z.infer<typeof ArchiveMergeProofSchema>

export type ArchiveStatus =
  | { kind: 'unknown'; reason: string }
  | { kind: 'not-created'; checkedAt: string }
  | { kind: 'changed'; reason: string }
  | {
      kind: 'open' | 'merged' | 'closed'
      reference: ArchiveReference
      url: string
      checkedAt: string
      checks: 'unknown' | 'pending' | 'passed' | 'failed'
      review: 'unknown' | 'pending' | 'approved' | 'changes-requested'
      /** Provider-reported merge commit; null when unavailable. A commit alone is not material proof. */
      mergeCommit: string | null
      proof: { kind: 'verified'; value: ArchiveMergeProof } | { kind: 'unknown'; reason: string }
    }

/** Asks the owning runtime to prove one merged review against fixed material bytes. */
export const ArchiveProofRequestSchema = z.strictObject({
  repoId: z.string().min(1),
  worktreeId: z.string().min(1),
  hostId: z.string().min(1),
  workflow: z.enum(['plan', 'acceptance']),
  provider: z.string().min(1).optional(),
  repository: z.string().min(1).optional(),
  number: z.number().int().positive().optional(),
  version: MaterialVersion,
  cycleId: z.string().min(1),
  revision: MaterialRevision
})
export type ArchiveProofRequest = z.infer<typeof ArchiveProofRequestSchema>

export const ArchiveProofResultSchema = z.strictObject({
  mergeCommit: SourceCommit.nullable(),
  changed: z.boolean().optional(),
  proof: z.union([
    z.strictObject({ kind: z.literal('verified'), value: ArchiveMergeProofSchema }),
    z.strictObject({ kind: z.literal('unknown'), reason: z.string().min(1) })
  ])
})
export type ArchiveProofResult = z.infer<typeof ArchiveProofResultSchema>

export function isArchivedMaterial(status: ArchiveStatus, material: ArchivedMaterial): boolean {
  if (status.kind !== 'merged' || status.proof.kind !== 'verified') {
    return false
  }
  const proof = status.proof.value
  return (
    ArchiveMergeProofSchema.safeParse(proof).success &&
    proof.mergeCommit === status.mergeCommit &&
    proof.reference.provider === status.reference.provider &&
    proof.reference.repository === status.reference.repository &&
    proof.reference.number === status.reference.number &&
    proof.reference.materialRevision === status.reference.materialRevision &&
    proof.material.workflow === material.workflow &&
    proof.material.version === material.version &&
    proof.material.cycleId === material.cycleId &&
    proof.material.revision === material.revision
  )
}

export type ArchiveJourneyLamp = 'unknown' | 'failed' | 'pending' | 'complete'

/**
 * One lamp rule for every journey axis: red only from provider-confirmed bad
 * states (closed / changes-requested / checks failed); merged but unproven
 * material stays yellow; absent data stays unknown, never green.
 */
export function archiveJourneyLamp(status: ArchiveStatus, archived: boolean): ArchiveJourneyLamp {
  if (archived) {
    return 'complete'
  }
  if (status.kind === 'unknown' || status.kind === 'not-created') {
    return 'unknown'
  }
  if (status.kind === 'changed') {
    return 'pending'
  }
  if (
    status.kind === 'closed' ||
    status.checks === 'failed' ||
    status.review === 'changes-requested'
  ) {
    return 'failed'
  }
  return 'pending'
}
