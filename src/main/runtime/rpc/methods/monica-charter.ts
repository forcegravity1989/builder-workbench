import { defineMonicaMethod } from '../../../monica/monica-rpc-observability'
import {
  CharterProbeRequestSchema,
  CharterReadRequestSchema,
  CharterStatusRequestSchema,
  CharterSubmitRequestSchema
} from '../../../../shared/monica/charter'
import { monicaRuntimeResult } from '../../../monica/monica-runtime-result'
import { nativeCharterService } from '../../../monica/charter-runtime'

export const MONICA_CHARTER_METHODS = [
  defineMonicaMethod({
    name: 'workbench.charter.probeRemote',
    params: CharterProbeRequestSchema,
    handler: (params, { runtime }) =>
      monicaRuntimeResult(() => nativeCharterService(runtime).probeRemote(params))
  }),
  defineMonicaMethod({
    name: 'workbench.charter.submit',
    params: CharterSubmitRequestSchema,
    handler: (params, { runtime }) =>
      monicaRuntimeResult(() => nativeCharterService(runtime).submit(params))
  }),
  defineMonicaMethod({
    name: 'workbench.charter.status',
    params: CharterStatusRequestSchema,
    handler: (params, { runtime }) =>
      monicaRuntimeResult(() => nativeCharterService(runtime).status(params))
  }),
  defineMonicaMethod({
    name: 'workbench.charter.read',
    params: CharterReadRequestSchema,
    handler: (params, { runtime }) =>
      monicaRuntimeResult(() => nativeCharterService(runtime).read(params))
  })
]
