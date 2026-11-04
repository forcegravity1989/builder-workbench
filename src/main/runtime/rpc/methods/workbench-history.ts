import { defineMethod } from '../core'
import {
  VersionHistoryListSchema,
  VersionHistoryReadSchema,
  VersionHistoryReadPlanSchema,
  VersionTreePlansSchema
} from '../../../../shared/workbench/version-history'
import { workbenchRuntimeResult } from '../../../workbench/workbench-runtime-result'
import { nativeVersionHistoryService } from '../../../workbench/version-history-runtime'

export const WORKBENCH_HISTORY_METHODS = [
  defineMethod({
    name: 'workbench.history.list',
    permission: 'workspace',
    params: VersionHistoryListSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeVersionHistoryService(runtime).list(params))
  }),
  defineMethod({
    name: 'workbench.history.listTreePlans',
    permission: 'workspace',
    params: VersionTreePlansSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeVersionHistoryService(runtime).listTreePlans(params))
  }),
  defineMethod({
    name: 'workbench.history.read',
    permission: 'workspace',
    params: VersionHistoryReadSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeVersionHistoryService(runtime).read(params))
  }),
  defineMethod({
    name: 'workbench.history.readPlan',
    permission: 'workspace',
    params: VersionHistoryReadPlanSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeVersionHistoryService(runtime).readPlan(params))
  })
]
