import { z } from 'zod'
import {
  Id,
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
/**
 * 创建期空计划初始化（G2 P2）：只走 create-only 语义，已有材料一律不覆盖。
 * expectedBranch 是创建结果核对——树 HEAD 必须是约定流程分支，防写错树。
 */
export const VersionMaterialInitializeSchema = z.strictObject({
  version: MaterialVersion,
  cycleId: Id,
  expectedBranch: z.string().min(1)
})
export type VersionMaterialInitialize = z.infer<typeof VersionMaterialInitializeSchema>
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
  | {
      ok: false
      error: {
        code: string
        message: string
        currentRevision?: string | null
        /** Process exit status when the failure came from a narrow remote executor. */
        exitCode?: number | null
      }
    }

export type VersionMaterialCandidate = {
  version: string
  state: 'ready' | 'migration-required' | 'invalid'
  error?: string
}
