import { z } from 'zod'
import { MetricScopeSchema } from './metrics'
import {
  PlanReferenceSchema,
  SourceCommit,
  MaterialVersion,
  type PlanningMaterial,
  type AcceptanceMaterial
} from './version-material'

export const VersionHistoryListSchema = z.strictObject({ scope: MetricScopeSchema })
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
  records: VersionHistorySource[]
  /** Unreadable entries remain visible without hiding the valid records. */
  problems: VersionHistoryProblem[]
}
export type VersionHistoryPlan = {
  document: PlanningMaterial
  revision: string
  planRef: z.infer<typeof PlanReferenceSchema>
  /** Committed evidence requires both baseline reachability and verified archive adoption. */
  source:
    | { kind: 'committed'; sourceCommit: string; baselineCommit: string; baselineRef: string }
    | { kind: 'draft'; sourceHostId: string; sourceWorktreeId: string }
}
export type VersionHistoryPort = {
  list(input: z.infer<typeof VersionHistoryListSchema>): Promise<VersionHistoryCatalog>
  read(input: z.infer<typeof VersionHistoryReadSchema>): Promise<{
    document: PlanningMaterial | AcceptanceMaterial
    revision: string
    sourceCommit: string
  }>
  readPlan(input: z.infer<typeof VersionHistoryReadPlanSchema>): Promise<VersionHistoryPlan>
}
