import { defineMonicaMethod } from '../../../monica/monica-rpc-observability'
import { ArchivePrStatusRequestSchema } from '../../../../shared/monica/archive-pr-status'
import { monicaRuntimeResult } from '../../../monica/monica-runtime-result'
import { readArchivePrStatus } from '../../../monica/archive-pr-status'
import { readWorkflowComments } from '../../../monica/workflow-comments'
import { WorkflowCommentsRequestSchema } from '../../../../shared/monica/workflow-comments'
import { readOverviewPull } from '../../../monica/overview-pull'

export const MONICA_ARCHIVE_METHODS = [
  defineMonicaMethod({
    name: 'workbench.archive.prStatus',
    params: ArchivePrStatusRequestSchema,
    handler: (params, { runtime }) =>
      monicaRuntimeResult(() => readArchivePrStatus(runtime, params))
  }),
  defineMonicaMethod({
    name: 'workbench.overview.pull',
    params: WorkflowCommentsRequestSchema,
    handler: (params, { runtime }) => monicaRuntimeResult(() => readOverviewPull(runtime, params))
  }),
  defineMonicaMethod({
    name: 'workbench.workflow.comments',
    params: WorkflowCommentsRequestSchema,
    handler: (params, { runtime }) =>
      monicaRuntimeResult(() => readWorkflowComments(runtime, params))
  })
]
