import { z } from 'zod'
import {
  Artifact,
  Id,
  MaterialRevision,
  MaterialVersion,
  AcceptanceMaterialSchema,
  PlanningMaterialSchema,
  PlanningProgressSourceSchema
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
  expectedBranch: z.string().min(1),
  progressSource: PlanningProgressSourceSchema.optional()
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
/**
 * #516 制品登记：把「文件已在工作树里」登记为 preparedArtifacts 的一条命令
 * 协议。只收身份与制品字段，不收文档——文档在拥有工作树的一侧从新鲜读取
 * 重建、只改 preparedArtifacts，人工字段按构造原样往返。kind 沿用 Artifact
 * 枚举；location 是工作树相对路径，存在性由文件系统拥有者核对。
 */
export const VersionMaterialAddArtifactSchema = VersionMaterialReadSchema.extend({
  // preparedArtifacts 只存在于验收材料；计划侧没有制品登记面。
  workflow: z.literal('acceptance'),
  kind: Artifact.shape.kind,
  location: Id,
  artifactId: Id.optional(),
  command: z.string().optional(),
  checksum: z.string().optional()
})
export type VersionMaterialAddArtifact = z.infer<typeof VersionMaterialAddArtifactSchema>

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
