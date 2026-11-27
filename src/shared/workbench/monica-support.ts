import { z } from 'zod'
import { BOT_AGENTS } from '../bot-types'

export const MonicaSupportRequest = z.object({ agent: z.enum(BOT_AGENTS).optional() }).strict()
