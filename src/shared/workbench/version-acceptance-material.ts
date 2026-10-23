import { z } from 'zod'
import { AcceptanceWorkflowStateSchema } from './version-workflow'
import {
  AcceptanceIssueMarksSchema,
  AcceptanceMaterialLinkSchema,
  Artifact,
  CandidateReferenceSchema,
  HumanDecision,
  Identity,
  Id,
  LegacyAcceptanceDirectiveSchema,
  LegacyAcceptanceRoundSchema,
  MaterialRevision,
  MetricReadingEvidenceSchema,
  PlanReferenceSchema,
  safeMaterialUrl,
  VersionTaskSnapshotSchema
} from './version-material-common'

/**
 * Meeting minutes stored on the acceptance material (optional schema3 section).
 * Same shape as the plan side minus the followup closure mark: acceptance has no
 * closure consumer, its followups flow verbatim into the next plan's 会议遗留
 * row. The model channel drafts the body only while `confirmed` is false;
 * confirmation is human-only, revocable in the UI, and freezes the whole section
 * while set. Followup ids are stable so human edits do not renumber the points
 * the next plan screen cites.
 */
export const AcceptanceMeetingMinutesSchema = z
  .strictObject({
    consensus: z.array(z.string()),
    followups: z.array(z.strictObject({ id: Id, text: z.string() })),
    confirmed: z.boolean(),
    confirmedAt: z.iso.datetime({ offset: true }).optional(),
    sources: z.string().optional(),
    updatedAt: z.iso.datetime({ offset: true }).optional()
  })
  .superRefine((minutes, context) => {
    const ids = new Set(minutes.followups.map((followup) => followup.id))
    if (ids.size !== minutes.followups.length) {
      context.addIssue({
        code: 'custom',
        message: 'Minutes followup ids must be unique',
        path: ['followups']
      })
    }
  })

export type AcceptanceMeetingMinutes = z.infer<typeof AcceptanceMeetingMinutesSchema>

/**
 * The version's demo environment, written back by the model after deploying per
 * the project's own entry point. A web service carries the URL the board opens in
 * the built-in Orca browser; a desktop application has no URL, so it records the
 * launched state instead of faking a link. Absent means not deployed yet.
 */
export const AcceptanceDemoEnvironmentSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('url'),
    // Human-facing system name for the board link text (「XX 系统」); the board
    // falls back to the raw URL when absent (2026-10-23 高保真反馈轮).
    label: z.string().trim().min(1).optional(),
    // Absolute http(s) only. `safeMaterialUrl` resolves against a base, so it
    // would also accept a protocol-relative `//host/path`, which the material
    // opener would then read as a worktree-relative path.
    url: z
      .string()
      .trim()
      .min(1)
      .refine(
        (value) => /^https?:\/\//i.test(value) && safeMaterialUrl(value),
        'Demo environment must be an absolute http(s) URL'
      )
  }),
  z.strictObject({ kind: z.literal('launched'), detail: z.string().trim().min(1) })
])

export type AcceptanceDemoEnvironment = z.infer<typeof AcceptanceDemoEnvironmentSchema>

export const AcceptanceMaterialSchema = z
  .strictObject({
    ...Identity,
    planRef: PlanReferenceSchema,
    candidateRef: CandidateReferenceSchema.optional(),
    preparedArtifacts: z.array(Artifact),
    // Version-level demo environment written back after deployment; absent means
    // not deployed. Replaces the retired per-goal deliveries.
    demoEnv: AcceptanceDemoEnvironmentSchema.optional(),
    preparationReview: z
      .strictObject({
        source: Id,
        recordedAt: z.iso.datetime({ offset: true }),
        materialRevision: MaterialRevision
      })
      .optional(),
    // Absent means not recorded, while [] records an empty task set.
    taskSnapshot: z.array(VersionTaskSnapshotSchema).optional(),
    results: z.array(
      z.strictObject({
        goalId: Id,
        readings: z.array(MetricReadingEvidenceSchema),
        decision: HumanDecision.optional(),
        note: z.string(),
        nextStep: z.string(),
        issueNotes: z.record(z.string(), z.string()).optional(),
        issueMarks: z.record(z.string(), AcceptanceIssueMarksSchema).optional(),
        // Pre-v10 human input, read-only: no v10 surface writes these, the board
        // shows them in one labelled legacy block, and a file on disk is only
        // converted through the session migration path with human confirmation.
        deliveries: z.array(z.strictObject({ title: z.string(), location: z.string() })).optional(),
        materials: z.array(AcceptanceMaterialLinkSchema).optional(),
        progress: z.string().optional(),
        rounds: z.array(LegacyAcceptanceRoundSchema).optional(),
        meetingDirectives: z.array(LegacyAcceptanceDirectiveSchema).optional()
      })
    ),
    // Meeting conclusions; the durable record the board annotations feed into.
    minutes: AcceptanceMeetingMinutesSchema.optional(),
    // Session-model-written SOP progress; absent means not started. The board
    // renders no lamps: the four on-screen stages are locators, not this enum.
    workflow: AcceptanceWorkflowStateSchema.optional()
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

export type AcceptanceMaterial = z.infer<typeof AcceptanceMaterialSchema>
