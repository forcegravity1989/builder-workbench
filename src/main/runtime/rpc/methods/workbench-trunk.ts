import { defineMethod } from '../core'
import { TrunkUpdateSchema } from '../../../../shared/workbench/trunk-update'
import { workbenchRuntimeResult } from '../../../workbench/workbench-runtime-result'
import { createTrunkUpdateService } from '../../../workbench/trunk-update-runtime'

export const WORKBENCH_TRUNK_METHODS = [
  defineMethod({
    name: 'workbench.trunk.update',
    permission: 'workspace',
    params: TrunkUpdateSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => createTrunkUpdateService(runtime).updateCode(params.scope))
  })
]
