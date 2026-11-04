import { defineMethod } from '../core'
import { MetricScopeSchema, MetricReadRequestSchema } from '../../../../shared/workbench/metrics'
import { workbenchRuntimeResult } from '../../../workbench/workbench-runtime-result'
import { nativeMetricsService } from '../../../workbench/metrics-runtime'

export const WORKBENCH_METRICS_METHODS = [
  defineMethod({
    name: 'workbench.metrics.list',
    permission: 'workspace',
    params: MetricScopeSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeMetricsService(runtime).list(params))
  }),
  defineMethod({
    name: 'workbench.metrics.read',
    permission: 'workspace',
    params: MetricReadRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeMetricsService(runtime).read(params))
  }),
  defineMethod({
    name: 'workbench.metrics.refresh',
    permission: 'workspace',
    params: MetricReadRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeMetricsService(runtime).refresh(params))
  })
]
