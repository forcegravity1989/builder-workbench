import { defineWorkbenchMethod } from '../../../workbench/workbench-rpc-observability'
import {
  WorkbenchGroupRemoval,
  WorkbenchRepoRemoval
} from '../../../../shared/workbench/repo-removal'

export const WORKBENCH_REPO_REMOVAL_METHODS = [
  defineWorkbenchMethod({
    name: 'workbench.repo.removeRegistration',
    params: WorkbenchRepoRemoval,
    handler: (params, { runtime }) => ({ removed: runtime.removeProjectRegistration(params) })
  }),
  defineWorkbenchMethod({
    name: 'workbench.repo.deleteGroup',
    params: WorkbenchGroupRemoval,
    handler: ({ groupId, members }, { runtime }) => runtime.deleteProjectGroup(groupId, members)
  })
]
