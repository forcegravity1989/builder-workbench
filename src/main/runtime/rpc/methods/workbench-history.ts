import { defineWorkbenchMethod } from '../../../workbench/workbench-rpc-observability'
import {
  VersionHistoryListSchema,
  VersionPlanEntryTimesSchema,
  VersionHistoryReadSchema,
  VersionHistoryReadPlanSchema,
  VersionTreePlansSchema
} from '../../../../shared/workbench/version-history'
import { workbenchRuntimeResult } from '../../../workbench/workbench-runtime-result'
import { nativeVersionHistoryService } from '../../../workbench/version-history-runtime'

export const WORKBENCH_HISTORY_METHODS = [
  defineWorkbenchMethod({
    name: 'workbench.history.listPlanEntryTimes',
    permission: 'workspace',
    params: VersionPlanEntryTimesSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeVersionHistoryService(runtime).listPlanEntryTimes(params))
  }),
  defineWorkbenchMethod({
    name: 'workbench.history.list',
    permission: 'workspace',
    params: VersionHistoryListSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeVersionHistoryService(runtime).list(params))
  }),
  defineWorkbenchMethod({
    name: 'workbench.history.listTreePlans',
    permission: 'workspace',
    params: VersionTreePlansSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeVersionHistoryService(runtime).listTreePlans(params))
  }),
  defineWorkbenchMethod({
    name: 'workbench.history.read',
    permission: 'workspace',
    params: VersionHistoryReadSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeVersionHistoryService(runtime).read(params))
  }),
  defineWorkbenchMethod({
    name: 'workbench.history.readPlan',
    permission: 'workspace',
    params: VersionHistoryReadPlanSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeVersionHistoryService(runtime).readPlan(params))
  })
]
