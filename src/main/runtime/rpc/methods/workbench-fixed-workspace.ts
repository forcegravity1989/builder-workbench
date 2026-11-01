import { defineMethod } from '../core'
import { FixedWorkspaceEnsureSchema } from '../../../../shared/workbench/fixed-workspace'
import { materialResult } from '../../../workbench/version-material-error'

export const WORKBENCH_FIXED_WORKSPACE_METHODS = [
  defineMethod({
    name: 'workbench.fixedWorkspace.ensure',
    params: FixedWorkspaceEnsureSchema,
    handler: (params, { runtime }) =>
      materialResult(() => runtime.ensureWorkbenchFixedWorkspace(params))
  })
]
