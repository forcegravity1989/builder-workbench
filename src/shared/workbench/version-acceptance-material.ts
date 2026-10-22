import { z } from 'zod'
import { AcceptanceWorkflowStateSchema } from './version-workflow'
import {
  AcceptanceIssueMarksSchema,
  Artifact,
  CandidateReferenceSchema,
  HumanDecision,
  Identity,
  Id,
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
    url: z.string().trim().min(1).refine(safeMaterialUrl, 'Demo environment must use http(s)')
  }),
  z.strictObject({ kind: z.literal('launched'), detail: z.string().trim().min(1) })
])

export type AcceptanceDemoEnvironment = z.infer<typeof AcceptanceDemoEnvironmentSchema>

/**
 * Fields retired by v10 (four-step meeting screen). The material schema is
 * strict, so an unknown key fails the whole parse — stored documents written
 * before the retirement would become unreadable. Reads strip these first and the
 * board says so honestly; nothing is rewritten on disk and no migration runs.
 */
const RETIRED_DOCUMENT_FIELDS = ['rounds'] as const
const RETIRED_RESULT_FIELDS = [
  'rounds',
  'meetingDirectives',
  'deliveries',
  'materials',
  'progress'
] as const

/** True when a stored document still carries retired fields, for the honest notice. */
export function hasRetiredAcceptanceFields(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false
  }
  const document = value as Record<string, unknown>
  if (RETIRED_DOCUMENT_FIELDS.some((field) => document[field] !== undefined)) {
    return true
  }
  const results = Array.isArray(document.results) ? document.results : []
  return results.some(
    (result) =>
      result !== null &&
      typeof result === 'object' &&
      RETIRED_RESULT_FIELDS.some(
        (field) => (result as Record<string, unknown>)[field] !== undefined
      )
  )
}

/** Drops retired keys before the strict parse; leaves everything else untouched. */
export function stripRetiredAcceptanceFields(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value
  }
  const document = { ...(value as Record<string, unknown>) }
  for (const field of RETIRED_DOCUMENT_FIELDS) {
    delete document[field]
  }
  if (Array.isArray(document.results)) {
    document.results = document.results.map((result) => {
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        return result
      }
      const next = { ...(result as Record<string, unknown>) }
      for (const field of RETIRED_RESULT_FIELDS) {
        delete next[field]
      }
      // Risk marking is retired on both cycle screens; carry stays a human field.
      const marks = next.issueMarks
      if (marks && typeof marks === 'object' && !Array.isArray(marks)) {
        next.issueMarks = Object.fromEntries(
          Object.entries(marks as Record<string, unknown>).map(([key, mark]) => {
            if (!mark || typeof mark !== 'object' || Array.isArray(mark)) {
              return [key, mark]
            }
            const { risk: _risk, ...rest } = mark as Record<string, unknown>
            return [key, rest]
          })
        )
      }
      return next
    })
  }
  return document
}

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
        issueMarks: z.record(z.string(), AcceptanceIssueMarksSchema).optional()
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
