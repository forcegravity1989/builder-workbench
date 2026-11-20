import { defineMonicaMethod } from '../../../monica/monica-rpc-observability'
import { ReleaseStatusRequestSchema } from '../../../../shared/monica/release-status'
import { monicaRuntimeResult } from '../../../monica/monica-runtime-result'
import { readReleaseStatus } from '../../../monica/release-status'

export const MONICA_RELEASE_METHODS = [
  defineMonicaMethod({
    name: 'workbench.release.status',
    params: ReleaseStatusRequestSchema,
    handler: (params, { runtime }) => monicaRuntimeResult(() => readReleaseStatus(runtime, params))
  })
]
