import * as z from 'zod'
import type { BotAgent } from '../bot-types'
import { startOfLocalDay } from '../automation-cron-occurrence'

/** Only these agents have a place where Orca can hold a run to reads. */
export const LOOK_AROUND_AGENTS = ['claude', 'codex'] as const satisfies readonly BotAgent[]

export function lookAroundSupported(agent: string): boolean {
  return LOOK_AROUND_AGENTS.some((entry) => entry === agent)
}

export const LOOK_AROUND_EVERY_CHOICES = [
  'every-4h',
  'every-2h',
  'twice-daily',
  'mornings'
] as const
export type LookAroundEvery = (typeof LOOK_AROUND_EVERY_CHOICES)[number]

/** Local hours each preset looks at; nothing runs at night. */
export const LOOK_AROUND_EVERY: Record<LookAroundEvery, readonly number[]> = {
  'every-4h': [8, 12, 16, 20],
  'every-2h': [8, 10, 12, 14, 16, 18, 20],
  'twice-daily': [8, 13],
  mornings: [8]
}

/** Each preset as Settings and the chat line say it. */
export const LOOK_AROUND_EVERY_LABELS: Record<LookAroundEvery, string> = {
  'every-4h': 'Every 4 hours, 8 AM to 8 PM',
  'every-2h': 'Every 2 hours, 8 AM to 8 PM',
  'twice-daily': 'Twice a day, 8 AM and 1 PM',
  mornings: 'Each morning at 8 AM'
}

export const LOOK_AROUND_FOCUS_MAX_LENGTH = 500

export const BotLookAroundSchema = z.object({
  on: z.boolean(),
  // A preset a newer client saved reads as the default rather than voiding the bot.
  every: z.enum(LOOK_AROUND_EVERY_CHOICES).catch('every-4h'),
  weekdaysOnly: z.boolean(),
  /** What to look for, in the owner's words; empty means anything waiting on them. */
  focus: z.string().max(LOOK_AROUND_FOCUS_MAX_LENGTH),
  /** When it was last turned on; a slot before it is never caught up. Absent: on all along. */
  since: z.number().optional()
})

export type BotLookAround = z.infer<typeof BotLookAroundSchema>

export const LOOK_AROUND_DEFAULTS: BotLookAround = {
  on: true,
  every: 'every-4h',
  weekdaysOnly: true,
  focus: ''
}

/** The bot's setting, or the defaults when it has never been changed. */
export function botLookAround(bot: { lookAround?: BotLookAround }): BotLookAround {
  return bot.lookAround ?? LOOK_AROUND_DEFAULTS
}

/** Which day a look was, on the viewer's wall clock, for "Looked yesterday 4:12 PM". */
export function lookedDay(at: number, now: number): 'today' | 'yesterday' | 'earlier' {
  const day = startOfLocalDay(at)
  const today = startOfLocalDay(now)
  return day === today ? 'today' : day === startOfLocalDay(today - 1) ? 'yesterday' : 'earlier'
}

/** Only the fields an edit names change, so two quick edits never undo each other. Turning it on
 *  stamps when, so a slot from before is never caught up. */
export function patchLookAround(
  setting: BotLookAround,
  patch: Partial<Omit<BotLookAround, 'since'>>,
  now: number
): BotLookAround {
  const on = patch.on ?? setting.on
  const since = on && !setting.on ? now : setting.since
  return {
    on,
    every: patch.every ?? setting.every,
    weekdaysOnly: patch.weekdaysOnly ?? setting.weekdaysOnly,
    focus: patch.focus ?? setting.focus,
    ...(since !== undefined ? { since } : {})
  }
}

/** The schedule as a cron line the automation scheduler evaluates, on the host's wall clock. */
export function lookAroundSchedule(setting: Pick<BotLookAround, 'every' | 'weekdaysOnly'>): string {
  return `0 ${LOOK_AROUND_EVERY[setting.every].join(',')} * * ${setting.weekdaysOnly ? '1-5' : '*'}`
}

/** Hours between looks, for "one interval after the first conversation". */
export function lookAroundIntervalMs(every: LookAroundEvery): number {
  const [first, second] = LOOK_AROUND_EVERY[every]
  const gap = first !== undefined && second !== undefined ? second - first : 24
  return gap * 60 * 60 * 1000
}
