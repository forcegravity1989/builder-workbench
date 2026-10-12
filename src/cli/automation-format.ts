/**
 * Human-readable automation output for the CLI.
 *
 * The host lines come from the authority's own projection, never from the
 * stored `executionTarget*` fields: a target that was removed — or removed and
 * re-registered under the same id — leaves those fields untouched, so printing
 * them alone would render a dead host identically to a healthy one and leave
 * `orca automations show` unable to complete the recovery it is named in.
 */

import type { Automation, AutomationRun } from '../shared/automations-types'
import { isOneShotAutomation } from '../shared/automation-schedule-kind'
import type { AutomationListItem } from '../shared/automation-list-scope'
import type { AutomationOwnerPrecondition } from '../shared/automation-owner-precondition'
import { getAutomationLegacyRepoId } from '../shared/automation-run-identity'
import { formatAutomationPrecheckTimeout } from '../shared/automation-precheck'
import { formatAutomationSchedule } from '../shared/automation-schedules'

export type AutomationListPayload = {
  automations: Automation[]
  /** Present only when the authority qualifies its rows; an older host sends none. */
  items?: AutomationListItem[]
}

export type AutomationShowPayload = {
  automation: Automation
  /** Present only when the authority can project an owner; an older host sends none. */
  owner?: AutomationOwnerPrecondition
  /** Serve mode's webhook base (http(s)://host:port); null/absent = no endpoint (desktop or older host). */
  webhookBaseUrl?: string | null
}

const ORPHAN_HOST_LABEL = 'orphan (no host can run this automation)'

/** A one-shot has no recurrence to label; an empty rrule is its data, not an error. */
function formatScheduleLabel(automation: Automation): string {
  return isOneShotAutomation(automation)
    ? `Once at ${new Date(automation.onceAt).toISOString()}`
    : formatAutomationSchedule(automation.rrule)
}

function formatOwnerSelector(selector: AutomationOwnerPrecondition['selector']): string {
  if (selector.kind === 'ssh') {
    return `ssh:${selector.targetId} (generation ${selector.targetGeneration})`
  }
  return selector.kind === 'orphan' ? ORPHAN_HOST_LABEL : 'self'
}

function formatListItemSelector(item: AutomationListItem): string {
  const selector = item.selector
  if (selector.kind === 'ssh') {
    return `ssh:${selector.targetId} (generation ${selector.targetGeneration})`
  }
  return selector.kind === 'orphan' ? `orphan — ${selector.issue}` : 'self'
}

/**
 * Webhook lines for show. The address is only real in serve mode; desktop gets an
 * honest "requires serve mode", and a legacy record without a token says how to
 * mint one instead of printing a URL nothing can authenticate against.
 */
function formatWebhookLines(automation: Automation, baseUrl: string | null | undefined): string[] {
  if (!baseUrl) {
    return ['webhook: unavailable (webhook triggers require serve mode)']
  }
  if (!automation.webhookToken) {
    return [
      'webhook: no token yet — `orca automations edit --regenerate-webhook-token` to mint one'
    ]
  }
  return [
    `webhook: POST ${baseUrl}/webhooks/automations/${automation.id} (header x-webhook-token)`,
    `webhookToken: ${automation.webhookToken}`
  ]
}

export function formatAutomationList(result: AutomationListPayload): string {
  if (result.automations.length === 0) {
    return 'No automations found.'
  }
  const hosts = new Map(result.items?.map((item) => [item.automationId, item]) ?? [])
  return result.automations
    .map((automation) => {
      const status = automation.enabled ? 'enabled' : 'disabled'
      const item = hosts.get(automation.id)
      const host = item ? `\nhost: ${formatListItemSelector(item)}` : ''
      return `${automation.id}  ${automation.name}  ${automation.agentId}  ${status}\n${formatScheduleLabel(automation)}  next: ${new Date(automation.nextRunAt).toISOString()}${host}`
    })
    .join('\n\n')
}

export function formatAutomationShow(result: AutomationShowPayload): string {
  const automation = result.automation
  const runContext = automation.runContext ?? null
  const projectLines = runContext
    ? [
        `runProjectId: ${runContext.projectId}`,
        `runHostId: ${runContext.hostId}`,
        `projectHostSetupId: ${runContext.projectHostSetupId}`,
        `runRepoId: ${runContext.repoId}`,
        `runPath: ${runContext.path}`,
        `legacyRepoId: ${getAutomationLegacyRepoId(automation)}`
      ]
    : [`legacyRepoId: ${getAutomationLegacyRepoId(automation)}`]
  return [
    `id: ${automation.id}`,
    `name: ${automation.name}`,
    `provider: ${automation.agentId}`,
    `enabled: ${automation.enabled}`,
    `schedule: ${formatScheduleLabel(automation)}`,
    isOneShotAutomation(automation)
      ? `onceAt: ${new Date(automation.onceAt).toISOString()}`
      : `rrule: ${automation.rrule}`,
    `precheck: ${
      automation.precheck
        ? `${automation.precheck.command} (timeout ${formatAutomationPrecheckTimeout(
            automation.precheck.timeoutSeconds
          )})`
        : 'none'
    }`,
    `nextRunAt: ${new Date(automation.nextRunAt).toISOString()}`,
    ...projectLines,
    `workspaceMode: ${automation.workspaceMode}`,
    `workspaceId: ${automation.workspaceId ?? 'null'}`,
    `baseBranch: ${automation.baseBranch ?? 'null'}`,
    `reuseSession: ${automation.reuseSession}`,
    `target: ${automation.executionTargetType}:${automation.executionTargetId}`,
    // Omitted rather than guessed: a host that reports no owner has none to report.
    ...(result.owner ? [`host: ${formatOwnerSelector(result.owner.selector)}`] : []),
    ...formatWebhookLines(automation, result.webhookBaseUrl),
    `prompt: ${automation.prompt}`
  ].join('\n')
}

export function formatAutomationRemoved(result: { removed: boolean; id: string }): string {
  return result.removed
    ? `Removed automation ${result.id}.`
    : `Automation ${result.id} not removed.`
}

export function formatAutomationRun(result: { run: AutomationRun }): string {
  return [
    `id: ${result.run.id}`,
    `automationId: ${result.run.automationId}`,
    `title: ${result.run.title}`,
    `status: ${result.run.status}`,
    `trigger: ${result.run.trigger}`,
    `scheduledFor: ${new Date(result.run.scheduledFor).toISOString()}`,
    `workspaceId: ${result.run.workspaceId ?? 'null'}`,
    `precheck: ${formatAutomationRunPrecheck(result.run)}`,
    `error: ${result.run.error ?? 'null'}`
  ].join('\n')
}

function formatAutomationRunPrecheck(run: AutomationRun): string {
  const result = run.precheckResult
  if (!result) {
    return 'none'
  }
  const outcome = result.timedOut
    ? 'timed out'
    : result.error
      ? 'error'
      : `exit ${result.exitCode ?? 'unknown'}`
  const output = result.stderr.trim() || result.stdout.trim()
  return output ? `${outcome}; ${output}` : outcome
}

export function formatAutomationRuns(result: { runs: AutomationRun[] }): string {
  if (result.runs.length === 0) {
    return 'No automation runs found.'
  }
  return result.runs
    .map(
      (run) =>
        `${run.id}  ${run.automationId}  ${run.status}  ${run.trigger}  ${new Date(run.scheduledFor).toISOString()}\n${run.title}${run.precheckResult ? `\nprecheck: ${formatAutomationRunPrecheck(run)}` : ''}${run.error ? `\nerror: ${run.error}` : ''}`
    )
    .join('\n\n')
}
