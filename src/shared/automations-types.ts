import type { TuiAgent } from './tui-agent'
import type { SetupDecision } from './worktree/create-types'
import type { TaskSourceContext, WorkspaceRunContext } from './task-source-context'

export type AutomationWorkspaceMode = 'existing' | 'new_per_run'
export type AutomationExecutionTargetType = 'local' | 'ssh'
export type AutomationSchedulerOwner = 'local_host_service' | 'ssh_bridge' | 'remote_host_service'
export type AutomationMissedRunPolicy = 'run_once_within_grace'
export type AutomationRunStatus =
  | 'pending'
  | 'dispatching'
  | 'dispatched'
  | 'completed'
  | 'skipped_precheck'
  | 'skipped_missed'
  | 'skipped_overlap'
  | 'skipped_unavailable'
  | 'skipped_needs_interactive_auth'
  | 'dispatch_failed'
export type AutomationRunTrigger = 'scheduled' | 'manual' | 'webhook'

/** Statuses a run can never leave; only these are safe to evict from history. */
export function isFinalAutomationRunStatus(status: AutomationRunStatus): boolean {
  return (
    status === 'completed' ||
    status === 'dispatch_failed' ||
    status === 'skipped_precheck' ||
    status === 'skipped_missed' ||
    status === 'skipped_overlap' ||
    status === 'skipped_unavailable' ||
    status === 'skipped_needs_interactive_auth'
  )
}

export type AutomationSchedulePreset =
  | 'hourly'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'custom'
  | 'once'
  | 'every_n_minutes'
  | 'every_n_hours'
export type AutomationRunUsageProvider = 'claude' | 'codex'
export type AutomationRunUsageStatus = 'known' | 'unavailable'
export type AutomationRunUsageAttribution = 'provider_session_time_window'
export type AutomationRunUsageUnavailableReason =
  | 'run_not_finished'
  | 'provider_unsupported'
  | 'remote_usage_unavailable'
  | 'usage_not_enabled'
  | 'scan_failed'
  | 'no_matching_session'
  | 'ambiguous_session'

export type AutomationRunUsage = {
  status: AutomationRunUsageStatus
  provider: AutomationRunUsageProvider | null
  model: string | null
  inputTokens: number | null
  outputTokens: number | null
  cacheReadTokens: number | null
  cacheWriteTokens: number | null
  reasoningOutputTokens: number | null
  totalTokens: number | null
  estimatedCostUsd: number | null
  estimatedCostSource: 'api_equivalent' | null
  providerSessionId: string | null
  attribution: AutomationRunUsageAttribution | null
  collectedAt: number
  unavailableReason: AutomationRunUsageUnavailableReason | null
  unavailableMessage: string | null
}

export type AutomationRunOutputSnapshot = {
  format: 'plain_text'
  content: string
  capturedAt: number
  truncated: boolean
}

export type AutomationPrecheck = {
  command: string
  timeoutSeconds: number
}

export type AutomationPrecheckResult = {
  command: string
  exitCode: number | null
  timedOut: boolean
  durationMs: number
  stdout: string
  stderr: string
  stdoutTruncated: boolean
  stderrTruncated: boolean
  error: string | null
  startedAt: number
  completedAt: number
}

export type Automation = {
  id: string
  /** Optional client request key used to make cross-authority creates retry-safe. */
  creationKey?: string
  name: string
  prompt: string
  precheck: AutomationPrecheck | null
  agentId: TuiAgent
  /** Why: runContext carries the logical project + host setup identity for
   *  multi-host projects; projectId remains only as the legacy repo-id storage
   *  field for pre-host-context automations.
   *  @deprecated Use runContext.projectId/runContext.repoId or
   *  getAutomationRunRepoId(). */
  runContext?: WorkspaceRunContext | null
  /** Why: task/provider data can come from a different host/account than the
   *  workspace run target, so automations persist it separately. */
  sourceContext?: TaskSourceContext | null
  /** @deprecated Legacy repo-id compatibility field. New code should persist
   *  runContext and use getAutomationRunRepoId() for fallback reads. */
  projectId: string
  executionTargetType: AutomationExecutionTargetType
  executionTargetId: string
  /** Why: pins the SSH registration incarnation this record was attached to, so a
   *  removed-and-re-added target reusing the id can't silently adopt it. Absent on
   *  local records, on legacy records, and on orphans whose target is gone. */
  executionTargetGeneration?: number
  schedulerOwner: AutomationSchedulerOwner
  workspaceMode: AutomationWorkspaceMode
  workspaceId: string | null
  baseBranch: string | null
  setupDecision?: SetupDecision
  reuseSession: boolean
  timezone: string
  rrule: string
  dtstart: number
  enabled: boolean
  nextRunAt: number
  lastRunAt?: number
  /** 存在即一次性任务：目标时间戳；此时 rrule 为空，nextRunAt 建档时直写 onceAt。 */
  onceAt?: number
  /** 已实际派发的调度次数（跳过/错过/手动不累计）。持久正本：运行历史会被保留
   *  策略裁剪，不能从 runs 数（铁律一：杀进程重开数字能重新计算）。 */
  scheduledRunCount?: number
  /** serve 模式 webhook 触发凭据：建档时随机生成一次，编辑可重生成。机器绑定，
   *  不进导出（design「数据模型」）。旧记录无此字段：编辑重生成后才可被 webhook 触发。 */
  webhookToken?: string | null
  missedRunPolicy: AutomationMissedRunPolicy
  missedRunGraceMinutes: number
  createdAt: number
  updatedAt: number
}

export type AutomationRun = {
  id: string
  automationId: string
  runContext?: WorkspaceRunContext | null
  sourceContext?: TaskSourceContext | null
  title: string
  scheduledFor: number
  status: AutomationRunStatus
  trigger: AutomationRunTrigger
  workspaceId: string | null
  /** Why: run history must remain understandable after the backing workspace
   *  is deleted and its live metadata is gone. */
  workspaceDisplayName?: string | null
  sessionKind: 'terminal'
  chatSessionId: string | null
  terminalSessionId: string | null
  /** Why: a terminal tab can later point at a different pane/PTY. Automation
   *  run reopening must target the pane that actually executed the run. */
  terminalPaneKey: string | null
  terminalPtyId: string | null
  outputSnapshot: AutomationRunOutputSnapshot | null
  precheckResult: AutomationPrecheckResult | null
  usage: AutomationRunUsage | null
  error: string | null
  startedAt: number | null
  dispatchedAt: number | null
  createdAt: number
  /** Why: run titles must stay unique once retention prunes old runs, so the
   *  number can no longer be derived from how many runs are currently kept. */
  runNumber?: number
  /** Why: a target that cannot resolve refuses every occurrence, so consecutive
   *  identical refusals fold into this record instead of one row each. Counts the
   *  occurrences the record stands for; absent means one. */
  occurrenceCount?: number
  /** `scheduledFor` of the most recently folded occurrence; absent until one folds. */
  lastOccurrenceAt?: number
}

/** A bounded history response; older hosts may continue returning `runs` only. */
export type AutomationRunsPage = {
  runs: AutomationRun[]
  nextCursor: string | null
}

export type AutomationCreateInput = {
  /** Optional idempotency key; repeated creates return the original record. */
  creationKey?: string
  name: string
  prompt: string
  precheck?: AutomationPrecheck | null
  agentId: TuiAgent
  runContext?: WorkspaceRunContext | null
  sourceContext?: TaskSourceContext | null
  /** @deprecated Legacy repo-id compatibility field required for older stored
   *  automations and clients. Pair it with runContext for new writes. */
  projectId: string
  workspaceMode: AutomationWorkspaceMode
  workspaceId?: string | null
  baseBranch?: string | null
  setupDecision?: SetupDecision
  reuseSession?: boolean
  timezone: string
  rrule: string
  dtstart: number
  /** 一次性任务的目标时间戳；存在时 rrule 必须为空（RPC 层联立校验）。 */
  onceAt?: number
  enabled?: boolean
  missedRunGraceMinutes?: number
}

export type AutomationUpdateInput = Partial<
  Pick<
    Automation,
    | 'name'
    | 'prompt'
    | 'precheck'
    | 'agentId'
    | 'runContext'
    | 'sourceContext'
    | 'projectId'
    | 'workspaceMode'
    | 'workspaceId'
    | 'baseBranch'
    | 'setupDecision'
    | 'reuseSession'
    | 'timezone'
    | 'rrule'
    | 'dtstart'
    | 'enabled'
    | 'missedRunGraceMinutes'
  >
> & {
  /** 一次性时刻：null 显式清除（一次性⇄循环切换），undefined 未提供。 */
  onceAt?: number | null
  /** true 时重生成 webhookToken（旧记录无 token 时即铸造一枚）。 */
  regenerateWebhookToken?: boolean
}

/** webhook 触发的两种结局：正常派发带回运行记录；上次仍在运行时按固定并发
 *  行为跳过并记录（skipped_overlap），不派发。 */
export type AutomationWebhookRunResult =
  | { outcome: 'dispatched'; run: AutomationRun }
  | { outcome: 'skipped_overlap' }

export type AutomationDispatchRequest = {
  automation: Automation
  run: AutomationRun
  dispatchToken: string
  /** This run's one-shot context, appended to the saved prompt at dispatch. Never written back to the record. */
  oneShotPrompt?: string | null
}

export type AutomationDispatchResult = {
  runId: string
  status: AutomationRunStatus
  workspaceId?: string | null
  workspaceDisplayName?: string | null
  terminalSessionId?: string | null
  terminalPaneKey?: string | null
  terminalPtyId?: string | null
  outputSnapshot?: AutomationRunOutputSnapshot | null
  precheckResult?: AutomationPrecheckResult | null
  usage?: AutomationRunUsage | null
  error?: string | null
}

// Why: external-manager types moved to their own module for the max-lines budget;
// re-exported here so the 30+ existing import sites stay unchanged.
export type * from './external-automations-types'
