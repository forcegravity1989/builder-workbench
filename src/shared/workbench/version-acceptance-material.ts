import { z } from 'zod'
import { AcceptanceWorkflowStateSchema } from './version-workflow'
import {
  AcceptanceIssueMarksSchema,
  AcceptanceMeetingDirectiveSchema,
  AcceptanceMaterialLinkSchema,
  AcceptanceRoundSchema,
  Artifact,
  CandidateReferenceSchema,
  HumanDecision,
  Identity,
  Id,
  MaterialRevision,
  MetricReadingEvidenceSchema,
  PlanReferenceSchema,
  VersionTaskSnapshotSchema
} from './version-material-common'

export const AcceptanceMaterialSchema = z
  .strictObject({
    ...Identity,
    planRef: PlanReferenceSchema,
    candidateRef: CandidateReferenceSchema.optional(),
    preparedArtifacts: z.array(Artifact),
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
        deliveries: z.array(z.strictObject({ title: z.string(), location: z.string() })),
        materials: z.array(AcceptanceMaterialLinkSchema).optional(),
        readings: z.array(MetricReadingEvidenceSchema),
        decision: HumanDecision.optional(),
        note: z.string(),
        progress: z.string().optional(),
        nextStep: z.string(),
        rounds: z.array(AcceptanceRoundSchema).optional(),
        meetingDirectives: z.array(AcceptanceMeetingDirectiveSchema).optional(),
        issueNotes: z.record(z.string(), z.string()).optional(),
        issueMarks: z.record(z.string(), AcceptanceIssueMarksSchema).optional()
      })
    ),
    // Session-model-written SOP progress; absent means not started.
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
    document.results.forEach((result, resultIndex) => {
      if (result.rounds) {
        if (new Set(result.rounds.map((round) => round.id)).size !== result.rounds.length) {
          context.addIssue({
            code: 'custom',
            message: 'Round ids must be unique within a goal result',
            path: ['results', resultIndex, 'rounds']
          })
        }
      }
      if (result.meetingDirectives) {
        if (
          new Set(result.meetingDirectives.map((directive) => directive.id)).size !==
          result.meetingDirectives.length
        ) {
          context.addIssue({
            code: 'custom',
            message: 'Meeting directive ids must be unique within a goal result',
            path: ['results', resultIndex, 'meetingDirectives']
          })
        }
      }
    })
  })

export type AcceptanceMaterial = z.infer<typeof AcceptanceMaterialSchema>
