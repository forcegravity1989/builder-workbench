import { defineMethod } from '../core'
import { ArchivePrStatusRequestSchema } from '../../../../shared/workbench/archive-pr-status'
import { workbenchRuntimeResult } from '../../../workbench/workbench-runtime-result'
import { readArchivePrStatus } from '../../../workbench/archive-pr-status'

export const WORKBENCH_ARCHIVE_METHODS = [
  defineMethod({
    name: 'workbench.archive.prStatus',
    params: ArchivePrStatusRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => readArchivePrStatus(runtime, params))
  })
]
