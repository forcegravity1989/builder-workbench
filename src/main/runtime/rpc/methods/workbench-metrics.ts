import { defineWorkbenchMethod } from '../../../workbench/workbench-rpc-observability'
import { MetricScopeSchema, MetricReadRequestSchema } from '../../../../shared/workbench/metrics'
import { workbenchRuntimeResult } from '../../../workbench/workbench-runtime-result'
import { nativeMetricsService } from '../../../workbench/metrics-runtime'

export const WORKBENCH_METRICS_METHODS = [
  defineWorkbenchMethod({
    name: 'workbench.metrics.list',
    params: MetricScopeSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeMetricsService(runtime).list(params))
  }),
  defineWorkbenchMethod({
    name: 'workbench.metrics.read',
    params: MetricReadRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeMetricsService(runtime).read(params))
  }),
  defineWorkbenchMethod({
    name: 'workbench.metrics.refresh',
    params: MetricReadRequestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => nativeMetricsService(runtime).refresh(params))
  })
]
