import { defineMonicaMethod } from '../../../monica/monica-rpc-observability'
import {
  MilestoneReadRequestSchema,
  MilestoneDiscardRequestSchema,
  MilestoneSaveRequestSchema,
  MilestoneWorkingRequestSchema,
  MilestoneSubmitRequestSchema
} from '../../../../shared/monica/project-milestones'
import { nativeMilestoneService } from '../../../monica/milestone-runtime'
import { monicaRuntimeResult } from '../../../monica/monica-runtime-result'

export const MONICA_MILESTONE_METHODS = [
  defineMonicaMethod({
    name: 'workbench.milestones.read',
    params: MilestoneReadRequestSchema,
    handler: (params, { runtime }) =>
      monicaRuntimeResult(() =>
        nativeMilestoneService(runtime).read(params.scope, params.includeProject)
      )
  }),
  defineMonicaMethod({
    name: 'workbench.milestones.working',
    params: MilestoneWorkingRequestSchema,
    handler: (params, { runtime }) =>
      monicaRuntimeResult(() => nativeMilestoneService(runtime).working(params.scope))
  }),
  defineMonicaMethod({
    name: 'workbench.milestones.save',
    params: MilestoneSaveRequestSchema,
    handler: (params, { runtime }) =>
      monicaRuntimeResult(() => nativeMilestoneService(runtime).save(params))
  }),
  defineMonicaMethod({
    name: 'workbench.milestones.discard',
    params: MilestoneDiscardRequestSchema,
    handler: (params, { runtime }) =>
      monicaRuntimeResult(() => nativeMilestoneService(runtime).discard(params))
  }),
  defineMonicaMethod({
    name: 'workbench.milestones.submit',
    params: MilestoneSubmitRequestSchema,
    handler: (params, { runtime }) =>
      monicaRuntimeResult(() => nativeMilestoneService(runtime).submit(params))
  })
]
