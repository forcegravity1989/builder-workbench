import { z } from 'zod'

const WorkbenchWorkspaceSkillPrepareRequest = z
  .object({
    repoId: z.string().min(1),
    worktreeId: z.string().min(1),
    hostId: z.string().min(1),
    topic: z.enum(['week-planning', 'version-acceptance', 'metrics-refresh'])
  })
  .strict()

export const WorkbenchSkillPrepareRequest = z.discriminatedUnion('topic', [
  WorkbenchWorkspaceSkillPrepareRequest,
  z.object({ topic: z.literal('improve-workbench') }).strict()
])

/** Every topic the workbench skill package carries. Screen entries prepare the first three over
 *  RPC; the bot template unpacks its bundle skill (acceptance-meeting) from the same archive. */
export type WorkbenchSkillTopic =
  | 'week-planning'
  | 'version-acceptance'
  | 'metrics-refresh'
  | 'acceptance-meeting'
