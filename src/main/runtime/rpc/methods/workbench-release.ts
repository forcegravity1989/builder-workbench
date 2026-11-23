import { defineWorkbenchMethod } from '../../../workbench/workbench-rpc-observability'
import { ReleaseStatusRequestSchema } from '../../../../shared/workbench/release-status'
import { workbenchRuntimeResult } from '../../../workbench/workbench-runtime-result'
import { readReleaseStatus } from '../../../workbench/release-status'

export const WORKBENCH_RELEASE_METHODS = [
  defineWorkbenchMethod({
    name: 'workbench.release.status',
    params: ReleaseStatusRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => readReleaseStatus(runtime, params))
  })
]
