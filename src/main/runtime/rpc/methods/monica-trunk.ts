import { defineMonicaMethod } from '../../../monica/monica-rpc-observability'
import { TrunkUpdateSchema } from '../../../../shared/monica/trunk-update'
import { monicaRuntimeResult } from '../../../monica/monica-runtime-result'
import { createTrunkUpdateService } from '../../../monica/trunk-update-runtime'

export const MONICA_TRUNK_METHODS = [
  defineMonicaMethod({
    name: 'workbench.trunk.update',
    params: TrunkUpdateSchema,
    handler: (params, { runtime }) =>
      monicaRuntimeResult(() =>
        createTrunkUpdateService(runtime).updateCode(params.scope, params.expectedBranch)
      )
  })
]
