import { z } from 'zod'

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
