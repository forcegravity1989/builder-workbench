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

export type WorkbenchSkillTopic = 'week-planning' | 'version-acceptance' | 'metrics-refresh'
