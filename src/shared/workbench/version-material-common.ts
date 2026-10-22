import { z } from 'zod'
import { TaskSourceContextSchema } from '../task-source-context-schema'
import { normalizeExecutionHostId } from '../execution-host'
import { validatePlanningVersion } from './version-document'
export const Id = z.string().trim().min(1)
export const MaterialVersion = z.string().superRefine((value, context) => {
  try {
    validatePlanningVersion(value)
  } catch {
    context.addIssue({ code: 'custom', message: 'Choose a valid version first' })
  }
})
export const MaterialRevision = z.string().regex(/^sha256:[a-f0-9]{64}$/)
export const SourceCommit = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/)

export const MetricReferenceSchema = z.strictObject({
  name: Id,
  definitionHash: Id,
  configurationCommit: SourceCommit
})

export const MetricReadingEvidenceSchema = z.strictObject({
  ref: MetricReferenceSchema,
  value: z.union([z.number().finite(), z.string()]),
  unit: z.string(),
  collectedAt: z.iso.datetime({ offset: true }),
  source: Id,
  collectorRevision: Id,
  observation: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('instant'), observedAt: z.iso.datetime({ offset: true }) }),
    z
      .strictObject({
        kind: z.literal('window'),
        start: z.iso.datetime({ offset: true }),
        end: z.iso.datetime({ offset: true }),
        granularity: z.enum(['day', 'week']),
        timezone: Id
      })
      .refine((window) => Date.parse(window.end) > Date.parse(window.start), 'Invalid time window')
  ])
})

export const VersionGoalSchema = z.strictObject({
  goalId: Id,
  title: z.string(),
  deliverable: z.string().optional(),
  acceptance: z.string().optional(),
  deadline: z.string().optional(),
  owner: z.string().optional(),
  metricTargets: z.array(
    z.strictObject({
      ref: MetricReferenceSchema,
      target: z.string(),
      baseline: MetricReadingEvidenceSchema.optional()
    })
  )
})

export const VersionTaskReferenceSchema = z.strictObject({
  provider: Id,
  repository: Id,
  number: z.number().int().positive(),
  goalId: Id.optional()
})

// Require an explicit host before native normalization; absence is not the local host.
const TaskSnapshotSource = z
  .object({
    kind: z.literal('task-source'),
    provider: z.enum(['github', 'gitlab', 'codehub', 'linear', 'jira']),
    projectId: Id,
    hostId: Id.refine((value) => normalizeExecutionHostId(value) !== null)
  })
  .passthrough()
  .transform((value, context) => {
    const result = TaskSourceContextSchema.safeParse(value)
    if (result.success) {
      return result.data
    }
    for (const issue of result.error.issues) {
      context.addIssue({ ...issue })
    }
    return z.NEVER
  })

export const VersionTaskSnapshotSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('ready'),
      reference: VersionTaskReferenceSchema,
      source: TaskSnapshotSource,
      iid: z.number().int().positive(),
      title: z.string(),
      state: Id,
      url: Id,
      labels: z.array(z.string()).optional(),
      assignee: z.string().optional(),
      readAt: z.iso.datetime({ offset: true })
    }),
    z.strictObject({
      kind: z.literal('unavailable'),
      reference: VersionTaskReferenceSchema,
      source: TaskSnapshotSource.optional(),
      readAt: z.iso.datetime({ offset: true }),
      error: Id
    })
  ])
  .superRefine((snapshot, context) => {
    if (snapshot.source && snapshot.source.provider !== snapshot.reference.provider) {
      context.addIssue({
        code: 'custom',
        message: 'Task source provider differs from reference',
        path: ['source']
      })
    }
    if (snapshot.kind === 'ready' && snapshot.iid !== snapshot.reference.number) {
      context.addIssue({
        code: 'custom',
        message: 'Task number differs from reference',
        path: ['iid']
      })
    }
  })

export const Identity = {
  schema_version: z.literal(3),
  version: MaterialVersion,
  cycleId: Id
}

/** Fixed acceptance material explicitly chosen as the source of planning progress. */
export const PlanningProgressSourceSchema = z.strictObject({
  version: MaterialVersion,
  cycleId: Id,
  sourceCommit: SourceCommit,
  revision: MaterialRevision
})
export type PlanningProgressSource = z.infer<typeof PlanningProgressSourceSchema>

export const PlanReferenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('committed'),
    version: MaterialVersion,
    cycleId: Id,
    revision: MaterialRevision,
    sourceCommit: SourceCommit
  }),
  z.strictObject({
    kind: z.literal('draft'),
    version: MaterialVersion,
    cycleId: Id,
    revision: MaterialRevision,
    sourceWorktreeId: Id,
    sourceHostId: Id
  })
])

export const CandidateReferenceSchema = z.strictObject({
  repository: Id,
  version: MaterialVersion,
  commit: SourceCommit
})

export const Artifact = z.strictObject({
  artifactId: Id,
  kind: z.enum(['delivery', 'package', 'verification', 'showcase']),
  location: Id,
  candidateRef: CandidateReferenceSchema,
  generatedAt: z.iso.datetime({ offset: true }),
  command: z.string().optional(),
  executionRoot: z.string().optional(),
  checksum: z.string().optional()
})

/** A cited human decision is evidence to verify, not permission for an agent to mark work Done. */
export const HumanDecision = z.strictObject({
  outcome: z.enum(['met', 'not-met', 'pending']),
  source: Id,
  recordedAt: z.iso.datetime({ offset: true }),
  materialRevision: MaterialRevision,
  reason: z.string()
})

/**
 * The Issue-level carry mark is a human field: it is the 延期遗留 the next plan
 * screen echoes. Risk marking is retired on both cycle screens, and stored
 * documents that still carry it are stripped on read rather than migrated.
 */
export const AcceptanceIssueMarksSchema = z.strictObject({
  carry: z.boolean().optional()
})

/** Shared http(s)-only guard for material links and the demo environment URL. */
export const safeMaterialUrl = (value: string): boolean => {
  try {
    return ['http:', 'https:'].includes(new URL(value, 'https://workbench.invalid').protocol)
  } catch {
    return false
  }
}

export type VersionGoal = z.infer<typeof VersionGoalSchema>
export type MetricReference = z.infer<typeof MetricReferenceSchema>
export type MetricReadingEvidence = z.infer<typeof MetricReadingEvidenceSchema>
export type AcceptanceIssueMarks = z.infer<typeof AcceptanceIssueMarksSchema>
export type VersionTaskReference = z.infer<typeof VersionTaskReferenceSchema>
export type VersionTaskSnapshot = z.infer<typeof VersionTaskSnapshotSchema>
