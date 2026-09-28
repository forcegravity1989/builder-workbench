import { z } from 'zod'
import {
  MetricReferenceSchema,
  type MetricReadingEvidenceSchema,
  SourceCommit
} from './version-material'

export const MetricScopeSchema = z.strictObject({
  repoId: z.string().min(1),
  worktreeId: z.string().min(1),
  hostId: z.string().min(1)
})
export type MetricScope = z.infer<typeof MetricScopeSchema>
export type MetricRef = z.infer<typeof MetricReferenceSchema>
export type MetricReadingEvidence = z.infer<typeof MetricReadingEvidenceSchema>

const Timezone = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value }).format()
      return true
    } catch {
      return false
    }
  }, 'Invalid IANA timezone')
const Day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`)
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  }, 'Invalid calendar date')

export const MetricWindowSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('current'), timezone: Timezone }),
  z
    .strictObject({
      kind: z.literal('range'),
      since: Day,
      until: Day,
      granularity: z.enum(['day', 'week']),
      timezone: Timezone
    })
    .refine((value) => value.since < value.until, 'Window must be left-closed, right-open')
    .refine(
      (value) =>
        value.granularity !== 'week' ||
        [value.since, value.until].every((day) => new Date(`${day}T00:00:00Z`).getUTCDay() === 1),
      '按周采集需使用周一到周一的完整周日期边界；任意日期范围请按日查询'
    )
])
export type MetricWindow = z.infer<typeof MetricWindowSchema>
export type MetricRange = Extract<MetricWindow, { kind: 'range' }>

export const MetricReadRequestSchema = z.strictObject({
  scope: MetricScopeSchema,
  ref: MetricReferenceSchema,
  window: MetricWindowSchema
})
export type MetricReadRequest = z.infer<typeof MetricReadRequestSchema>

export type MetricDefinition = {
  ref: MetricRef
  role: 'north_star' | 'lagging' | 'leading'
  name: string
  def: string
  target: string
  unit: string
  feature: string
  leads?: string
  collect: { kind: 'script'; run: string[]; retro: boolean }
}
export type MetricProblem = { code: string; message: string; name?: string }

/** Render one catalog problem as fixable-error text; a problem is never shown as "not configured". */
export function metricProblemText(problem: MetricProblem): string {
  return problem.name ? `${problem.name}：${problem.message}` : problem.message
}
export type MetricCatalog = {
  scope: MetricScope
  configurationCommit: string
  configurationRef: string
  timezone: string
  definitions: MetricDefinition[]
  problems: MetricProblem[]
}

export type MetricRun = {
  runId: string
  startedAt: string
  finishedAt: string
  collectorRevision: string
  dataTarget: { repository: string; commit: string; hostId: string }
}
export type MetricReading =
  | { status: 'ready'; readings: MetricReadingEvidence[]; run: MetricRun }
  | {
      status: 'unknown' | 'error'
      reason: MetricProblem
      /** Historical evidence keeps its original timestamps and is never a fresh reading. */
      previous?: Extract<MetricReading, { status: 'ready' }>
      run?: MetricRun
    }

/** One service for all three screens; only refresh executes a collector. */
export type MetricsPort = {
  list(scope: MetricScope): Promise<MetricCatalog>
  read(request: MetricReadRequest): Promise<MetricReading>
  refresh(request: MetricReadRequest): Promise<MetricReading>
}

export const ProjectMetricsRequestSchema = z.strictObject({
  scope: MetricScopeSchema,
  window: MetricWindowSchema
})
export type ProjectMetricsRequest = z.infer<typeof ProjectMetricsRequestSchema>
export type ProjectMetricKey = 'commits' | 'merged-prs' | 'open-issues'
export type ProjectMetrics = {
  scope: MetricScope
  branch: string
  dataCommit: string
  series: Record<ProjectMetricKey, MetricReading>
}

export const MetricConfigurationSchema = z.strictObject({
  scope: MetricScopeSchema,
  configurationCommit: SourceCommit
})

export function metricRefKey(ref: MetricRef): string {
  return JSON.stringify([ref.name, ref.definitionHash, ref.configurationCommit])
}

/** Matching provenance alone does not establish comparable periods or normalized statistics. */
export function sameMetricDefinition(
  left: MetricReadingEvidence,
  right: MetricReadingEvidence
): boolean {
  return (
    left.ref.name === right.ref.name &&
    left.ref.definitionHash === right.ref.definitionHash &&
    left.collectorRevision === right.collectorRevision &&
    left.unit === right.unit &&
    left.source === right.source
  )
}
