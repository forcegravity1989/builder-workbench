import { defineMonicaMethod } from '../../../monica/monica-rpc-observability'
import { MonicaGroupRemoval, MonicaRepoRemoval } from '../../../../shared/monica/repo-removal'

export const MONICA_REPO_REMOVAL_METHODS = [
  defineMonicaMethod({
    name: 'workbench.repo.removeRegistration',
    params: MonicaRepoRemoval,
    handler: (params, { runtime }) => ({ removed: runtime.removeProjectRegistration(params) })
  }),
  defineMonicaMethod({
    name: 'workbench.repo.deleteGroup',
    params: MonicaGroupRemoval,
    handler: ({ groupId, members }, { runtime }) => runtime.deleteProjectGroup(groupId, members)
  })
]
