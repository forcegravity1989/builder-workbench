import * as z from 'zod'

export const TIDY_UP_EVERY_CHOICES = ['night', 'week'] as const
export type TidyUpEvery = (typeof TIDY_UP_EVERY_CHOICES)[number]

export const TIDY_UP_EVERY_LABELS: Record<TidyUpEvery, string> = {
  night: 'Each night after 3 AM',
  week: 'Once a week, after 3 AM'
}

/** Local hours a night's tidy-up starts in while the host is awake; a host asleep through them
 *  catches up once it is awake, until the next night starts. */
export const TIDY_UP_HOURS = { from: 3, until: 8 } as const

export const BotTidyUpSchema = z.object({
  on: z.boolean(),
  // A choice a newer client saved reads as the default rather than voiding the bot.
  every: z.enum(TIDY_UP_EVERY_CHOICES).catch('night').optional(),
  /** When it was last turned on; absent, it has been on since the bot was made. */
  since: z.number().optional()
})

export type BotTidyUp = { on: boolean; every: TidyUpEvery; since?: number }

export function botTidyUp(bot: { tidyUp?: z.infer<typeof BotTidyUpSchema> }): BotTidyUp {
  const since = bot.tidyUp?.since
  return {
    on: bot.tidyUp?.on ?? true,
    every: bot.tidyUp?.every ?? 'night',
    ...(since !== undefined ? { since } : {})
  }
}

/** The setting after an edit: turning it on stamps when, so only nights from then on catch up. */
export function patchTidyUp(
  current: BotTidyUp,
  patch: Partial<Pick<BotTidyUp, 'on' | 'every'>>,
  now: number
): BotTidyUp {
  const on = patch.on ?? current.on
  const since = on && !current.on ? now : current.since
  return {
    on,
    every: patch.every ?? current.every,
    ...(since !== undefined ? { since } : {})
  }
}
