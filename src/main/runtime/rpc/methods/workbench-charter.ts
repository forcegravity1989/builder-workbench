import { defineWorkbenchMethod } from '../../../workbench/workbench-rpc-observability'
import {
  CharterProbeRequestSchema,
  CharterReadRequestSchema,
  CharterStatusRequestSchema,
  CharterSubmitRequestSchema
} from '../../../../shared/workbench/charter'
import { workbenchRuntimeResult } from '../../../workbench/workbench-runtime-result'
import { nativeCharterService } from '../../../workbench/charter-runtime'

export const WORKBENCH_CHARTER_METHODS = [
  defineWorkbenchMethod({
    name: 'workbench.charter.probeRemote',
    params: CharterProbeRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeCharterService(runtime).probeRemote(params))
  }),
  defineWorkbenchMethod({
    name: 'workbench.charter.submit',
    params: CharterSubmitRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeCharterService(runtime).submit(params))
  }),
  defineWorkbenchMethod({
    name: 'workbench.charter.status',
    params: CharterStatusRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeCharterService(runtime).status(params))
  }),
  defineWorkbenchMethod({
    name: 'workbench.charter.read',
    params: CharterReadRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeCharterService(runtime).read(params))
  })
]
