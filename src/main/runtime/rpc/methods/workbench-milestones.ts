import { defineWorkbenchMethod } from '../../../workbench/workbench-rpc-observability'
import {
  MilestoneReadRequestSchema,
  MilestoneSubmitRequestSchema
} from '../../../../shared/workbench/project-milestones'
import { nativeMilestoneService } from '../../../workbench/milestone-runtime'
import { workbenchRuntimeResult } from '../../../workbench/workbench-runtime-result'

export const WORKBENCH_MILESTONE_METHODS = [
  defineWorkbenchMethod({
    name: 'workbench.milestones.read',
    params: MilestoneReadRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeMilestoneService(runtime).read(params.scope))
  }),
  defineWorkbenchMethod({
    name: 'workbench.milestones.submit',
    params: MilestoneSubmitRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeMilestoneService(runtime).submit(params))
  })
]
