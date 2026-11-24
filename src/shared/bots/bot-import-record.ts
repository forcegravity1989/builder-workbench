import * as z from 'zod'

export const BOT_IMPORT_APPS = ['openclaw', 'hermes', 'openbot', 'export'] as const
export type BotImportApp = (typeof BOT_IMPORT_APPS)[number]

export const BOT_IMPORT_APP_LABELS: Record<BotImportApp, string> = {
  openclaw: 'OpenClaw',
  hermes: 'Hermes',
  openbot: 'OpenBot',
  export: 'another app'
}

const path = z.string().trim().min(1).max(1024)

/** Where the old bot is: an app's folder on this computer, or what the old bot exported for the owner. */
export const BotImportFromSchema = z.object({
  app: z.enum(BOT_IMPORT_APPS),
  /** The old bot's own folder (an OpenClaw workspace, a Hermes profile), or the export folder. */
  path,
  /** The old bot's id in its app (an OpenClaw agent id, a Hermes profile name); absent for an export. */
  agent: z.string().trim().min(1).max(200).optional(),
  /** Files the owner dropped in besides the folder. */
  files: z.array(path).max(50).optional()
})
export type BotImportFrom = z.infer<typeof BotImportFromSchema>

/** What a bot keeps of where it came from: enough to send its first turn again, and to find it on a re-import. */
export const BotImportedFromSchema = BotImportFromSchema.extend({
  /** The old bot's name. */
  name: z.string().trim().min(1).max(200).optional(),
  /** Whether the old bot's reply was saved in the new bot's home. */
  reply: z.boolean().optional()
})
export type BotImportedFrom = z.infer<typeof BotImportedFromSchema>

/** What the old bot wrote back when asked for its setup; saved in the new bot's home, never sent as a turn. */
export const BOT_IMPORT_REPLY_MAX = 200_000
export const BOT_IMPORT_REPLY_FILE = 'import/old-bot-reply.md'
