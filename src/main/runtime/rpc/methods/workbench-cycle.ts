import { defineMethod } from '../core'
import { CycleSyncSchema } from '../../../../shared/workbench/cycle-sync'
import { workbenchRuntimeResult } from '../../../workbench/workbench-runtime-result'
import { createCycleSyncService } from '../../../workbench/cycle-sync-runtime'

export const WORKBENCH_CYCLE_METHODS = [
  defineMethod({
    name: 'workbench.cycle.syncTrunk',
    params: CycleSyncSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => createCycleSyncService(runtime).syncTrunk(params.scope))
  })
]
