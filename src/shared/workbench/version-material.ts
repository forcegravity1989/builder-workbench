import { z } from 'zod'
import { TaskSourceContextSchema } from '../task-source-context-schema'
import { normalizeExecutionHostId } from '../execution-host'
import { validatePlanningVersion } from './version-document'

const Id = z.string().trim().min(1)
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
  .transform((value, ctx) => {
    const source = TaskSourceContextSchema.safeParse(value)
    if (!source.success) {
      ctx.addIssue({ code: 'custom', message: 'Invalid task source context' })
      return z.NEVER
    }
    return source.data
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

const Identity = {
  schema_version: z.literal(3),
  version: MaterialVersion,
  cycleId: Id
}

export const PlanningMaterialSchema = z
  .strictObject({
    ...Identity,
    summary: z.strictObject({ progress: z.string(), risks: z.string() }),
    goals: z.array(VersionGoalSchema),
    tasks: z.array(VersionTaskReferenceSchema)
  })
  .superRefine((document, context) => {
    const ids = new Set(document.goals.map((goal) => goal.goalId))
    if (ids.size !== document.goals.length) {
      context.addIssue({ code: 'custom', message: 'Goal ids must be unique', path: ['goals'] })
    }
    document.tasks.forEach((task, index) => {
      if (task.goalId && !ids.has(task.goalId)) {
        context.addIssue({
          code: 'custom',
          message: 'Task refers to an unknown goal',
          path: ['tasks', index, 'goalId']
        })
      }
    })
  })

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

const Artifact = z.strictObject({
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
const HumanDecision = z.strictObject({
  outcome: z.enum(['met', 'not-met', 'pending']),
  source: Id,
  recordedAt: z.iso.datetime({ offset: true }),
  materialRevision: MaterialRevision,
  reason: z.string()
})

export const AcceptanceMaterialSchema = z
  .strictObject({
    ...Identity,
    planRef: PlanReferenceSchema,
    candidateRef: CandidateReferenceSchema.optional(),
    preparedArtifacts: z.array(Artifact),
    // Absent means not recorded, while [] records an empty task set.
    taskSnapshot: z.array(VersionTaskSnapshotSchema).optional(),
    results: z.array(
      z.strictObject({
        goalId: Id,
        deliveries: z.array(z.strictObject({ title: z.string(), location: z.string() })),
        readings: z.array(MetricReadingEvidenceSchema),
        decision: HumanDecision.optional(),
        note: z.string(),
        nextStep: z.string()
      })
    )
  })
  .superRefine((document, context) => {
    if (document.planRef.version !== document.version) {
      context.addIssue({
        code: 'custom',
        message: 'Acceptance must reference the same version plan',
        path: ['planRef']
      })
    }
    if (new Set(document.results.map((result) => result.goalId)).size !== document.results.length) {
      context.addIssue({
        code: 'custom',
        message: 'Goal result ids must be unique',
        path: ['results']
      })
    }
  })

export type PlanningMaterial = z.infer<typeof PlanningMaterialSchema>
export type AcceptanceMaterial = z.infer<typeof AcceptanceMaterialSchema>
export type VersionMaterial = PlanningMaterial | AcceptanceMaterial
export type VersionGoal = z.infer<typeof VersionGoalSchema>
export type MetricReference = z.infer<typeof MetricReferenceSchema>
export type MetricReadingEvidence = z.infer<typeof MetricReadingEvidenceSchema>

export type VersionTaskReference = z.infer<typeof VersionTaskReferenceSchema>
export type VersionTaskSnapshot = z.infer<typeof VersionTaskSnapshotSchema>
