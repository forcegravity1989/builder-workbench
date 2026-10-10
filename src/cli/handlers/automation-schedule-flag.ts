/**
 * Schedule-trigger parsing for the automations CLI: presets, one-shot, interval,
 * cron, and RRULE expressions all resolve here into the wire's rrule/onceAt pair.
 */

import type { AutomationSchedulePreset } from '../../shared/automations-types'
import { buildAutomationRrule } from '../../shared/automation-schedule-occurrences'
import { isValidAutomationSchedule } from '../../shared/automation-schedule-parsing'
import { getOptionalStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'

const PRESET_TRIGGERS = new Set<AutomationSchedulePreset>(['hourly', 'daily', 'weekdays', 'weekly'])
const SCHEDULE_MODIFIER_FLAGS = ['day', 'time'] as const
const EVERY_TRIGGER_PATTERN = /^every ([1-9]\d*)(m|h)$/

function getScheduleModifierFlag(flags: Map<string, string | boolean>): string | undefined {
  return SCHEDULE_MODIFIER_FLAGS.find((flag) => flags.has(flag))
}

function validateScheduleModifierApplicability(
  flags: Map<string, string | boolean>,
  raw: string
): void {
  if (raw !== 'once' && flags.has('at')) {
    throw new RuntimeClientError(
      'invalid_argument',
      '--at can only be used with the once automation trigger'
    )
  }
  const isPreset = PRESET_TRIGGERS.has(raw as AutomationSchedulePreset)
  if (!isPreset) {
    if (flags.has('time')) {
      throw new RuntimeClientError(
        'invalid_argument',
        '--time can only be used with preset automation triggers'
      )
    }
    if (flags.has('day')) {
      throw new RuntimeClientError(
        'invalid_argument',
        '--day can only be used with the weekly automation preset'
      )
    }
    return
  }
  if (raw === 'hourly' && flags.has('time')) {
    throw new RuntimeClientError(
      'invalid_argument',
      '--time cannot be used with the hourly automation preset; use a cron trigger such as "30 * * * *" to choose the minute'
    )
  }
  if (raw !== 'weekly' && flags.has('day')) {
    throw new RuntimeClientError(
      'invalid_argument',
      '--day can only be used with the weekly automation preset'
    )
  }
}

function getOptionalDayFlag(flags: Map<string, string | boolean>): number | undefined {
  const raw = flags.get('day')
  if (raw === undefined) {
    return undefined
  }
  const day = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : Number.NaN
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    throw new RuntimeClientError('invalid_argument', '--day must be an integer from 0 to 6')
  }
  return day
}

function getTimeFlag(flags: Map<string, string | boolean>): { hour: number; minute: number } {
  const value = flags.get('time')
  if (value === undefined) {
    return { hour: 9, minute: 0 }
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new RuntimeClientError('invalid_argument', '--time must use HH:MM format')
  }
  return parseTimeFlag(value)
}

function parseTimeFlag(value: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) {
    throw new RuntimeClientError('invalid_argument', '--time must use HH:MM format')
  }
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new RuntimeClientError('invalid_argument', '--time must be a valid 24-hour time')
  }
  return { hour, minute }
}

/** One-shot target time: any ISO timestamp the clock can still reach. */
function getOnceAtFlag(flags: Map<string, string | boolean>): number {
  const raw = flags.get('at')
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new RuntimeClientError('invalid_argument', '--trigger once requires --at <ISO timestamp>')
  }
  const at = new Date(raw.trim()).getTime()
  if (!Number.isFinite(at)) {
    throw new RuntimeClientError('invalid_argument', '--at must be an ISO timestamp')
  }
  if (at <= Date.now()) {
    throw new RuntimeClientError('invalid_argument', '--at must be in the future')
  }
  return at
}

export function getScheduleFlag(
  flags: Map<string, string | boolean>,
  required: boolean
): { rrule: string; dtstart: number; onceAt?: number | null } | undefined {
  const trigger = getOptionalStringFlag(flags, 'trigger')
  const schedule = getOptionalStringFlag(flags, 'schedule')
  if (trigger && schedule) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Use either --trigger or --schedule, not both.'
    )
  }
  const raw = trigger ?? schedule
  if (!raw) {
    const modifier = getScheduleModifierFlag(flags)
    if (modifier) {
      throw new RuntimeClientError(
        'invalid_argument',
        `--${modifier} requires --trigger or --schedule`
      )
    }
    if (required) {
      throw new RuntimeClientError('invalid_argument', 'Missing required --trigger')
    }
    return undefined
  }
  if (raw === 'manual') {
    throw new RuntimeClientError(
      'invalid_argument',
      'Manual-only automations are not supported yet. Create a scheduled automation with --disabled and run it with `orca automations run <id>` when needed.'
    )
  }
  validateScheduleModifierApplicability(flags, raw)
  if (raw === 'once') {
    return { rrule: '', dtstart: Date.now(), onceAt: getOnceAtFlag(flags) }
  }
  const everyMatch = EVERY_TRIGGER_PATTERN.exec(raw)
  if (everyMatch) {
    // 间隔型走 MINUTELY 数学（dtstart 锚点）：HOURLY 分支不感知 INTERVAL，
    // 写 FREQ=HOURLY;INTERVAL=2 会实跑成每小时。
    const minutes = Number(everyMatch[1]) * (everyMatch[2] === 'h' ? 60 : 1)
    if (!Number.isSafeInteger(minutes * 60_000)) {
      throw new RuntimeClientError('invalid_argument', `Invalid automation trigger: ${raw}`)
    }
    return { rrule: `FREQ=MINUTELY;INTERVAL=${minutes}`, dtstart: Date.now(), onceAt: null }
  }
  const { hour, minute } = raw === 'hourly' ? { hour: 0, minute: 0 } : getTimeFlag(flags)
  const dayOfWeek = raw === 'weekly' ? (getOptionalDayFlag(flags) ?? 1) : 1
  const rrule = PRESET_TRIGGERS.has(raw as AutomationSchedulePreset)
    ? buildAutomationRrule({
        preset: raw as Exclude<AutomationSchedulePreset, 'custom' | 'once'>,
        hour,
        minute,
        dayOfWeek
      })
    : raw
  if (!isValidAutomationSchedule(rrule)) {
    throw new RuntimeClientError('invalid_argument', `Invalid automation trigger: ${raw}`)
  }
  // onceAt: null 让编辑里的 --trigger 显式清一次性回到循环；建档时是冗余空值。
  return { rrule, dtstart: Date.now(), onceAt: null }
}
