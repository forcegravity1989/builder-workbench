import { defineMonicaMethod } from '../../../monica/monica-rpc-observability'
import { FixedWorkspaceEnsureSchema } from '../../../../shared/monica/fixed-workspace'
import { materialResult } from '../../../monica/version-material-error'

export const MONICA_FIXED_WORKSPACE_METHODS = [
  defineMonicaMethod({
    name: 'workbench.fixedWorkspace.ensure',
    params: FixedWorkspaceEnsureSchema,
    handler: (params, { runtime }) =>
      materialResult(() => runtime.ensureMonicaFixedWorkspace(params))
  })
]
