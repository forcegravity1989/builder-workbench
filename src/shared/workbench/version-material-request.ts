import { z } from 'zod'
import {
  MaterialRevision,
  MaterialVersion,
  AcceptanceMaterialSchema,
  PlanningMaterialSchema
} from './version-material'

export const VersionMaterialScopeSchema = z.strictObject({
  repoId: z.string().min(1),
  worktreeId: z.string().min(1),
  hostId: z.string().min(1),
  workflow: z.enum(['plan', 'acceptance'])
})
export const VersionMaterialReadSchema = VersionMaterialScopeSchema.extend({
  version: MaterialVersion
})
export const VersionMaterialSaveSchema = z.discriminatedUnion('workflow', [
  VersionMaterialReadSchema.extend({
    workflow: z.literal('plan'),
    expectedRevision: MaterialRevision.nullable(),
    document: PlanningMaterialSchema
  }),
  VersionMaterialReadSchema.extend({
    workflow: z.literal('acceptance'),
    expectedRevision: MaterialRevision.nullable(),
    document: AcceptanceMaterialSchema
  })
])
export type VersionMaterialScope = z.infer<typeof VersionMaterialScopeSchema>
export type VersionMaterialRead = z.infer<typeof VersionMaterialReadSchema>
export type VersionMaterialSave = z.infer<typeof VersionMaterialSaveSchema>

export type VersionMaterialResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; currentRevision?: string | null } }

export type VersionMaterialCandidate = {
  version: string
  state: 'ready' | 'migration-required' | 'invalid'
  error?: string
}
