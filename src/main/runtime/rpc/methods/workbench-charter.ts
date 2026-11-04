import { defineMethod } from '../core'
import {
  CharterProbeRequestSchema,
  CharterReadRequestSchema,
  CharterStatusRequestSchema,
  CharterSubmitRequestSchema
} from '../../../../shared/workbench/charter'
import { workbenchRuntimeResult } from '../../../workbench/workbench-runtime-result'
import { nativeCharterService } from '../../../workbench/charter-runtime'

export const WORKBENCH_CHARTER_METHODS = [
  defineMethod({
    name: 'workbench.charter.probeRemote',
    permission: 'workspace',
    params: CharterProbeRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeCharterService(runtime).probeRemote(params))
  }),
  defineMethod({
    name: 'workbench.charter.submit',
    permission: 'workspace',
    params: CharterSubmitRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeCharterService(runtime).submit(params))
  }),
  defineMethod({
    name: 'workbench.charter.status',
    permission: 'workspace',
    params: CharterStatusRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeCharterService(runtime).status(params))
  }),
  defineMethod({
    name: 'workbench.charter.read',
    permission: 'workspace',
    params: CharterReadRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeCharterService(runtime).read(params))
  })
]
