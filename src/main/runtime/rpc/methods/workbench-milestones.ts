import { defineWorkbenchMethod } from '../../../workbench/workbench-rpc-observability'
import {
  MilestoneReadRequestSchema,
  MilestoneDiscardRequestSchema,
  MilestoneSaveRequestSchema,
  MilestoneWorkingRequestSchema,
  MilestoneSubmitRequestSchema
} from '../../../../shared/workbench/project-milestones'
import { nativeMilestoneService } from '../../../workbench/milestone-runtime'
import { workbenchRuntimeResult } from '../../../workbench/workbench-runtime-result'

export const WORKBENCH_MILESTONE_METHODS = [
  defineWorkbenchMethod({
    name: 'workbench.milestones.read',
    params: MilestoneReadRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() =>
        nativeMilestoneService(runtime).read(params.scope, params.includeProject)
      )
  }),
  defineWorkbenchMethod({
    name: 'workbench.milestones.working',
    params: MilestoneWorkingRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeMilestoneService(runtime).working(params.scope))
  }),
  defineWorkbenchMethod({
    name: 'workbench.milestones.save',
    params: MilestoneSaveRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeMilestoneService(runtime).save(params))
  }),
  defineWorkbenchMethod({
    name: 'workbench.milestones.discard',
    params: MilestoneDiscardRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeMilestoneService(runtime).discard(params))
  }),
  defineWorkbenchMethod({
    name: 'workbench.milestones.submit',
    params: MilestoneSubmitRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeMilestoneService(runtime).submit(params))
  })
]
