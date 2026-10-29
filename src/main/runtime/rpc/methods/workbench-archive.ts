import { defineMethod } from '../core'
import { ArchivePrStatusRequestSchema } from '../../../../shared/workbench/archive-pr-status'
import { workbenchRuntimeResult } from '../../../workbench/workbench-runtime-result'
import { readArchivePrStatus } from '../../../workbench/archive-pr-status'
import { readWorkflowComments } from '../../../workbench/workflow-comments'
import { WorkflowCommentsRequestSchema } from '../../../../shared/workbench/workflow-comments'

export const WORKBENCH_ARCHIVE_METHODS = [
  defineMethod({
    name: 'workbench.archive.prStatus',
    params: ArchivePrStatusRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => readArchivePrStatus(runtime, params))
  }),
  defineMethod({
    name: 'workbench.workflow.comments',
    params: WorkflowCommentsRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => readWorkflowComments(runtime, params))
  })
]
