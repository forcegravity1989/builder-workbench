import { defineMonicaMethod } from '../../../monica/monica-rpc-observability'
import {
  MilestoneReadRequestSchema,
  MilestoneSubmitRequestSchema
} from '../../../../shared/monica/project-milestones'
import { nativeMilestoneService } from '../../../monica/milestone-runtime'
import { monicaRuntimeResult } from '../../../monica/monica-runtime-result'

export const MONICA_MILESTONE_METHODS = [
  defineMonicaMethod({
    name: 'workbench.milestones.read',
    params: MilestoneReadRequestSchema,
    handler: (params, { runtime }) =>
      monicaRuntimeResult(() => nativeMilestoneService(runtime).read(params.scope))
  }),
  defineMonicaMethod({
    name: 'workbench.milestones.submit',
    params: MilestoneSubmitRequestSchema,
    handler: (params, { runtime }) =>
      monicaRuntimeResult(() => nativeMilestoneService(runtime).submit(params))
  })
]
