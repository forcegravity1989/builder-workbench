import { defineMethod } from '../core'
import {
  CharterProbeRequestSchema,
  CharterStatusRequestSchema,
  CharterSubmitRequestSchema
} from '../../../../shared/workbench/charter'
import { workbenchRuntimeResult } from '../../../workbench/workbench-runtime-result'
import { nativeCharterService } from '../../../workbench/charter-runtime'

export const WORKBENCH_CHARTER_METHODS = [
  defineMethod({
    name: 'workbench.charter.probeRemote',
    params: CharterProbeRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeCharterService(runtime).probeRemote(params))
  }),
  defineMethod({
    name: 'workbench.charter.submit',
    params: CharterSubmitRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeCharterService(runtime).submit(params))
  }),
  defineMethod({
    name: 'workbench.charter.status',
    params: CharterStatusRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeCharterService(runtime).status(params))
  })
]
