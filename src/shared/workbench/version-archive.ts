import { z } from 'zod'
import { MaterialRevision, MaterialVersion, SourceCommit } from './version-material'

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
