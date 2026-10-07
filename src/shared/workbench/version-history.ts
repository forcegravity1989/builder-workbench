import { z } from 'zod'
import { MetricScopeSchema } from './metrics'
import {
  PlanReferenceSchema,
  SourceCommit,
  MaterialVersion,
  type PlanningMaterial,
  type AcceptanceMaterial
} from './version-material'

export const VersionHistoryListSchema = z.strictObject({
  scope: MetricScopeSchema,
  /** Overview reads one current file per version; explicit progress history keeps all revisions. */
  currentOnly: z.boolean().optional()
})
export const VersionTreePlansSchema = z.strictObject({
  scope: MetricScopeSchema,
  adoptedCommit: SourceCommit.optional()
})
export const VersionHistoryReadPlanSchema = z.strictObject({
  scope: MetricScopeSchema,
  planRef: PlanReferenceSchema
})
export const VersionHistoryReadSchema = z.strictObject({
  scope: MetricScopeSchema,
  sourceCommit: SourceCommit,
  version: MaterialVersion,
  cycleId: z.string().min(1),
  workflow: z.enum(['plan', 'acceptance'])
})
export type VersionHistorySource = {
  version: string
  cycleId: string
  sourceCommit: string
  revision: string
  workflow: 'plan' | 'acceptance'
  committedAt: string
}
export type VersionHistoryProblem = Pick<
  VersionHistorySource,
  'version' | 'sourceCommit' | 'workflow' | 'committedAt'
> & { code: string; message: string }
export type VersionHistoryCatalog = {
  baselineCommit?: string
  records: VersionHistorySource[]
  /** Unreadable entries remain visible without hiding the valid records. */
  problems: VersionHistoryProblem[]
}
/**
 * A plan committed on the cycle branch itself (its HEAD tree), not on the
 * adopted baseline: the acceptance board reads the same branch its session
 * works in. No commit timestamp — tree entries carry none, and consumers
 * must not invent one.
 */
export type VersionTreePlan = Omit<VersionHistorySource, 'committedAt'>
export type VersionTreePlanCatalog = {
  alignment?: 'aligned' | 'unverified'
  /** The cycle branch HEAD the plans were listed from. */
  head: string
  plans: VersionTreePlan[]
  /** Unreadable or malformed plan folders stay visible next to the valid ones. */
  problems: { version: string; code: string; message: string }[]
}
export type VersionHistoryPlan = {
  document: PlanningMaterial
  revision: string
  planRef: z.infer<typeof PlanReferenceSchema>
  /** A committed plan is the data.json bytes on the adopted baseline, not a provider merge record. */
  source:
    | { kind: 'committed'; sourceCommit: string; baselineCommit: string; baselineRef: string }
    | { kind: 'draft'; sourceHostId: string; sourceWorktreeId: string }
}
export type VersionHistoryPort = {
  list(input: z.infer<typeof VersionHistoryListSchema>): Promise<VersionHistoryCatalog>
  /** Lists plan folders on the cycle branch HEAD; one folder with data.json is one version. */
  listTreePlans(input: z.infer<typeof VersionTreePlansSchema>): Promise<VersionTreePlanCatalog>
  read(input: z.infer<typeof VersionHistoryReadSchema>): Promise<{
    document: PlanningMaterial | AcceptanceMaterial
    revision: string
    sourceCommit: string
  }>
  readPlan(input: z.infer<typeof VersionHistoryReadPlanSchema>): Promise<VersionHistoryPlan>
}
