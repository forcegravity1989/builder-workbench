import { z } from 'zod'

export const WorkbenchSkillPrepareRequest = z
  .object({
    repoId: z.string().min(1),
    worktreeId: z.string().min(1),
    hostId: z.string().min(1),
    topic: z.enum(['week-planning', 'version-acceptance', 'metrics-refresh'])
  })
  .strict()

export type WorkbenchSkillTopic = 'week-planning' | 'version-acceptance' | 'metrics-refresh'
