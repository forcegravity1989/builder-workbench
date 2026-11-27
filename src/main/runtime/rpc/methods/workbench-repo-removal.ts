import { defineWorkbenchMethod } from '../../../workbench/workbench-rpc-observability'
import { WorkbenchGuardedRepoRemoval } from '../../../../shared/workbench/repo-removal'

export const WORKBENCH_REPO_REMOVAL_METHODS = [
  defineWorkbenchMethod({
    name: 'workbench.repo.removeRegistration',
    permission: 'workspace',
    params: WorkbenchGuardedRepoRemoval,
    handler: ({ repoId, path, addedAt }, { runtime }) =>
      runtime.removeProject(`id:${repoId}`, { path, addedAt })
  })
]
