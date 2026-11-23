import { z } from 'zod'
import { appStarSourceSchema } from './gh-star-source'
import {
  FEATURE_INTERACTION_CATEGORIES,
  FEATURE_INTERACTION_IDS,
  FEATURE_INTERACTION_USAGE_BUCKETS,
  getFeatureInteractionCategory
} from './feature-interactions'
import {
  starNagAgentBucketSchema,
  starNagOutcomeSchema,
  starNagPromptModeSchema,
  starNagPromptSourceSchema
} from './star-nag-telemetry'
import {
  agentKindSchema,
  errorClassSchema,
  launchSourceSchema,
  repoMethodSchema,
  requestKindSchema,
  workspaceSourceSchema
} from './telemetry-property-schemas'

// ── Per-event schemas ───────────────────────────────────────────────────

// Cohort signal (repo count at emit time); `.optional()` lets a fail-soft `undefined` validate. See docs/onboarding-funnel-cohort-addendum.md.
export const nthRepoAddedSchema = z.number().int().nonnegative().optional()

export const appOpenedSchema = z.object({ nth_repo_added: nthRepoAddedSchema }).strict()

export const featureInteractionIdSchema = z.enum(FEATURE_INTERACTION_IDS)
export const featureInteractionCategorySchema = z.enum(FEATURE_INTERACTION_CATEGORIES)
export const featureInteractionUsageBucketSchema = z.enum(FEATURE_INTERACTION_USAGE_BUCKETS)
export const featureInteractionUsageBucketSourceSchema = z.enum([
  'crossed_now',
  'observed_existing'
])
export const featureInteractionUsageBucketReachedSchema = z
  .object({
    feature_id: featureInteractionIdSchema,
    feature_category: featureInteractionCategorySchema,
    count_bucket: featureInteractionUsageBucketSchema,
    bucket_source: featureInteractionUsageBucketSourceSchema,
    nth_repo_added: nthRepoAddedSchema
  })
  .strict()
  .refine((value) => getFeatureInteractionCategory(value.feature_id) === value.feature_category, {
    message: 'feature_category must match feature_id',
    path: ['feature_category']
  })

export const repoAddedSchema = z
  // Why: `.optional()` so paths that can't detect git-ness validate cleanly; never default-guess `false` — omit instead.
  .object({
    method: repoMethodSchema,
    is_git_repo: z.boolean().optional(),
    nth_repo_added: nthRepoAddedSchema
  })
  .strict()

export const appStarredOrcaSchema = z
  .object({
    source: appStarSourceSchema,
    nth_repo_added: nthRepoAddedSchema
  })
  .strict()

export const starNagOutcomeEventSchema = z
  .object({
    outcome: starNagOutcomeSchema,
    source: starNagPromptSourceSchema,
    mode: starNagPromptModeSchema,
    threshold: z.number().int().positive(),
    agents_since_baseline: z.number().int().nonnegative(),
    agents_since_baseline_bucket: starNagAgentBucketSchema,
    nth_repo_added: nthRepoAddedSchema,
    next_threshold: z.number().int().positive().optional(),
    cooldown_days: z.number().int().positive().optional()
  })
  .strict()
  .refine(
    (payload) =>
      payload.next_threshold === undefined ||
      payload.outcome === 'dismissed' ||
      payload.outcome === 'later',
    {
      message: 'next_threshold is only valid for later or dismissed outcomes',
      path: ['next_threshold']
    }
  )
  .refine(
    (payload) =>
      payload.cooldown_days === undefined ||
      payload.outcome === 'later' ||
      payload.outcome === 'dismissed',
    {
      message: 'cooldown_days is only valid for later or dismissed outcomes',
      path: ['cooldown_days']
    }
  )

export const workspaceCreatedSchema = z
  .object({
    source: workspaceSourceSchema,
    from_existing_branch: z.boolean(),
    nth_repo_added: nthRepoAddedSchema
  })
  .strict()

export const agentStartedSchema = z
  .object({
    agent_kind: agentKindSchema,
    launch_source: launchSourceSchema,
    request_kind: requestKindSchema,
    nth_repo_added: nthRepoAddedSchema
  })
  .strict()
export const agentPromptSentSchema = z
  .object({
    agent_kind: agentKindSchema,
    launch_source: launchSourceSchema,
    request_kind: requestKindSchema,
    nth_repo_added: nthRepoAddedSchema
  })
  .strict()

// Enum-only by design: `.strict()` blocks `error_message`/`error_stack`, keeping raw user/path content off the wire.
export const agentErrorSchema = z
  .object({
    error_class: errorClassSchema,
    agent_kind: agentKindSchema,
    nth_repo_added: nthRepoAddedSchema
  })
  .strict()

// ── BW feature-usage events (#687) ───────────────────────────────────────
// Same enum-only discipline: free text (meeting subjects, deploy URLs,
// pipeline and version names) never crosses the wire.

export const bwAssistantRequestActionIdSchema = z.enum([
  'deploy',
  'book-meeting',
  'aggregate-report',
  'archive-pr',
  'release',
  'breakdown-goal',
  'organize-minutes',
  'sync-minutes',
  // 板面批注面板的发送也走 PlanSendMenu 送达链路，是同一挂载点的真实路径。
  'send-annotations'
])
export type BwAssistantRequestActionId = z.infer<typeof bwAssistantRequestActionIdSchema>
export const bwAssistantRequestScreenSchema = z.enum(['plan', 'acceptance'])
export type BwAssistantRequestScreen = z.infer<typeof bwAssistantRequestScreenSchema>

export const bwAssistantRequestSentSchema = z
  .object({
    action_id: bwAssistantRequestActionIdSchema,
    screen: bwAssistantRequestScreenSchema
  })
  .strict()

export const bwPackageBuildSchema = z
  .object({
    outcome: z.enum(['launched', 'failed'])
  })
  .strict()

export const bwVersionCreatedSchema = z.object({}).strict()

// 任务开工/打开（#687 补缺）：outcome 记分发核的真实去向，source 区分
// 三处入口；工作区名、Issue 标题等自由文本不上报。
export const bwTaskStartOutcomeSchema = z.enum([
  'opened',
  'choice-opened',
  'composer-opened',
  'unavailable'
])
export type BwTaskStartOutcome = z.infer<typeof bwTaskStartOutcomeSchema>
export const bwTaskStartSourceSchema = z.enum(['task-screen', 'task-dialog', 'plan-board'])
export type BwTaskStartSource = z.infer<typeof bwTaskStartSourceSchema>

export const bwTaskStartSchema = z
  .object({
    outcome: bwTaskStartOutcomeSchema,
    source: bwTaskStartSourceSchema
  })
  .strict()
