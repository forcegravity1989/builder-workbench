import { defineMethod } from '../core'
import { ArchiveProofRequestSchema } from '../../../../shared/workbench/version-archive'
import { workbenchRuntimeResult } from '../../../workbench/workbench-runtime-result'
import { readArchiveProof } from '../../../workbench/version-history-runtime'

export const WORKBENCH_ARCHIVE_METHODS = [
  defineMethod({
    name: 'workbench.archive.proof',
    params: ArchiveProofRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => readArchiveProof(runtime, params))
  })
]
