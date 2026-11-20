import { defineMonicaMethod } from '../../../monica/monica-rpc-observability'
import {
  VersionHistoryListSchema,
  VersionPlanEntryTimesSchema,
  VersionHistoryReadSchema,
  VersionHistoryReadPlanSchema,
  VersionTreePlansSchema
} from '../../../../shared/monica/version-history'
import { monicaRuntimeResult } from '../../../monica/monica-runtime-result'
import { nativeVersionHistoryService } from '../../../monica/version-history-runtime'

export const MONICA_HISTORY_METHODS = [
  defineMonicaMethod({
    name: 'workbench.history.listPlanEntryTimes',
    params: VersionPlanEntryTimesSchema,
    handler: (params, { runtime }) =>
      monicaRuntimeResult(() => nativeVersionHistoryService(runtime).listPlanEntryTimes(params))
  }),
  defineMonicaMethod({
    name: 'workbench.history.list',
    params: VersionHistoryListSchema,
    handler: (params, { runtime }) =>
      monicaRuntimeResult(() => nativeVersionHistoryService(runtime).list(params))
  }),
  defineMonicaMethod({
    name: 'workbench.history.listTreePlans',
    params: VersionTreePlansSchema,
    handler: (params, { runtime }) =>
      monicaRuntimeResult(() => nativeVersionHistoryService(runtime).listTreePlans(params))
  }),
  defineMonicaMethod({
    name: 'workbench.history.read',
    params: VersionHistoryReadSchema,
    handler: (params, { runtime }) =>
      monicaRuntimeResult(() => nativeVersionHistoryService(runtime).read(params))
  }),
  defineMonicaMethod({
    name: 'workbench.history.readPlan',
    params: VersionHistoryReadPlanSchema,
    handler: (params, { runtime }) =>
      monicaRuntimeResult(() => nativeVersionHistoryService(runtime).readPlan(params))
  })
]
