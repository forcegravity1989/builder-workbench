import { z } from 'zod'
import { BOT_AGENTS } from '../bot-types'

const navigationContext = z.strictObject({
  name: z.string().min(1),
  project: z.string().min(1),
  version: z.string().min(1).optional()
})

export type MonicaNavigationContext = z.infer<typeof navigationContext>

export const MonicaSupportRequest = z.strictObject({
  agent: z.enum(BOT_AGENTS).optional(),
  navigation: navigationContext.nullable().optional()
})
