import { defineMethod } from '../core'
import { ReleaseStatusRequestSchema } from '../../../../shared/workbench/release-status'
import { workbenchRuntimeResult } from '../../../workbench/workbench-runtime-result'
import { readReleaseStatus } from '../../../workbench/release-status'

export const WORKBENCH_RELEASE_METHODS = [
  defineMethod({
    name: 'workbench.release.status',
    params: ReleaseStatusRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => readReleaseStatus(runtime, params))
  })
]
