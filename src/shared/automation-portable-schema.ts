/**
 * The portable automation file: the subset of a record that survives a move
 * between machines. Machine-bound fields — host, project, workspace,
 * enablement, counters, timestamps, webhook token — are never projected and
 * never accepted, so an imported file can only carry configuration, not state.
 */

import type { Automation, AutomationPrecheck, AutomationWorkspaceMode } from './automations-types'
import type { TuiAgent } from './tui-agent'

export const AUTOMATION_PORTABLE_SCHEMA_VERSION = 1

export type AutomationPortableRecord = {
  schemaVersion: number
  name: string
  prompt: string
  agentId: TuiAgent
  precheck: AutomationPrecheck | null
  timezone: string
  /** 循环调度；一次性任务为空串（onceAt 携带目标时刻）。 */
  rrule: string
  dtstart: number
  /** 一次性任务目标时间戳；循环任务不带。 */
  onceAt?: number
  missedRunGraceMinutes: number
  workspaceMode: AutomationWorkspaceMode
  baseBranch: string | null
  reuseSession: boolean
}

export function projectAutomationPortable(automation: Automation): AutomationPortableRecord {
  return {
    schemaVersion: AUTOMATION_PORTABLE_SCHEMA_VERSION,
    name: automation.name,
    prompt: automation.prompt,
    agentId: automation.agentId,
    precheck: automation.precheck,
    timezone: automation.timezone,
    rrule: automation.rrule,
    dtstart: automation.dtstart,
    ...(automation.onceAt != null ? { onceAt: automation.onceAt } : {}),
    missedRunGraceMinutes: automation.missedRunGraceMinutes,
    workspaceMode: automation.workspaceMode,
    baseBranch: automation.baseBranch,
    reuseSession: automation.reuseSession
  }
}

function requireString(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid automation file: field "${field}" is required.`)
  }
  return value
}

function requireNumber(record: Record<string, unknown>, field: string): number {
  const value = record[field]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid automation file: field "${field}" must be a number.`)
  }
  return value
}

function parsePrecheck(record: Record<string, unknown>): AutomationPrecheck | null {
  const precheck = record.precheck
  if (precheck === null || precheck === undefined) {
    return null
  }
  if (typeof precheck !== 'object' || Array.isArray(precheck)) {
    throw new Error('Invalid automation file: field "precheck" must be an object or null.')
  }
  const command = (precheck as Record<string, unknown>).command
  const timeoutSeconds = (precheck as Record<string, unknown>).timeoutSeconds
  if (typeof command !== 'string' || command.length === 0) {
    throw new Error('Invalid automation file: field "precheck.command" is required.')
  }
  if (typeof timeoutSeconds !== 'number' || !Number.isFinite(timeoutSeconds)) {
    throw new Error('Invalid automation file: field "precheck.timeoutSeconds" must be a number.')
  }
  return { command, timeoutSeconds }
}

/** 指名报错（缺失/类型不符的字段名进消息）；不部分导入。 */
export function parseAutomationPortable(text: string): AutomationPortableRecord {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw new Error(`Not a valid automation file: ${(error as Error).message}`)
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Not a valid automation file: expected a JSON object.')
  }
  const record = raw as Record<string, unknown>
  if (record.schemaVersion !== AUTOMATION_PORTABLE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported automation file schemaVersion: ${String(record.schemaVersion)} ` +
        `(expected ${AUTOMATION_PORTABLE_SCHEMA_VERSION}).`
    )
  }
  const onceAt = record.onceAt
  const parsedOnceAt =
    onceAt !== undefined && onceAt !== null ? requireNumber(record, 'onceAt') : undefined
  if (parsedOnceAt !== undefined) {
    if (typeof record.rrule === 'string' && record.rrule.trim() !== '') {
      throw new Error('Invalid automation file: onceAt and rrule are mutually exclusive.')
    }
  } else {
    requireString(record, 'rrule')
  }
  const workspaceMode = requireString(record, 'workspaceMode')
  if (workspaceMode !== 'existing' && workspaceMode !== 'new_per_run') {
    throw new Error(
      'Invalid automation file: field "workspaceMode" must be existing or new_per_run.'
    )
  }
  const baseBranch = record.baseBranch
  if (baseBranch !== null && baseBranch !== undefined && typeof baseBranch !== 'string') {
    throw new Error('Invalid automation file: field "baseBranch" must be a string or null.')
  }
  const reuseSession = record.reuseSession
  if (typeof reuseSession !== 'boolean') {
    throw new Error('Invalid automation file: field "reuseSession" must be a boolean.')
  }
  return {
    schemaVersion: AUTOMATION_PORTABLE_SCHEMA_VERSION,
    name: requireString(record, 'name'),
    prompt: requireString(record, 'prompt'),
    agentId: requireString(record, 'agentId') as TuiAgent,
    precheck: parsePrecheck(record),
    timezone: requireString(record, 'timezone'),
    rrule: typeof record.rrule === 'string' ? record.rrule : '',
    dtstart: requireNumber(record, 'dtstart'),
    ...(parsedOnceAt !== undefined ? { onceAt: parsedOnceAt } : {}),
    missedRunGraceMinutes: requireNumber(record, 'missedRunGraceMinutes'),
    workspaceMode,
    baseBranch: baseBranch ?? null,
    reuseSession
  }
}
