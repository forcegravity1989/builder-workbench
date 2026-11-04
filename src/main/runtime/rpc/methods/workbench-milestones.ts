import { defineMethod } from '../core'
import {
  MilestoneReadRequestSchema,
  MilestoneSubmitRequestSchema
} from '../../../../shared/workbench/project-milestones'
import { nativeMilestoneService } from '../../../workbench/milestone-runtime'
import { workbenchRuntimeResult } from '../../../workbench/workbench-runtime-result'

export const WORKBENCH_MILESTONE_METHODS = [
  defineMethod({
    name: 'workbench.milestones.read',
    permission: 'workspace',
    params: MilestoneReadRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeMilestoneService(runtime).read(params.scope))
  }),
  defineMethod({
    name: 'workbench.milestones.submit',
    permission: 'workspace',
    params: MilestoneSubmitRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeMilestoneService(runtime).submit(params))
  })
]
