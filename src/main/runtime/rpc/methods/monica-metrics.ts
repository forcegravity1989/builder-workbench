import { defineMonicaMethod } from '../../../monica/monica-rpc-observability'
import { MetricScopeSchema, MetricReadRequestSchema } from '../../../../shared/monica/metrics'
import { monicaRuntimeResult } from '../../../monica/monica-runtime-result'
import { nativeMetricsService } from '../../../monica/metrics-runtime'
import { metricReadingFailureCode } from '../../../monica/metrics/collector-service'

export const MONICA_METRICS_METHODS = [
  defineMonicaMethod({
    name: 'workbench.metrics.list',
    params: MetricScopeSchema,
    handler: (params, { runtime }) =>
      monicaRuntimeResult(() => nativeMetricsService(runtime).list(params))
  }),
  defineMonicaMethod({
    name: 'workbench.metrics.read',
    params: MetricReadRequestSchema,
    handler: (params, { runtime }) =>
      monicaRuntimeResult(() => nativeMetricsService(runtime).read(params))
  }),
  defineMonicaMethod(
    {
      name: 'workbench.metrics.refresh',
      params: MetricReadRequestSchema,
      handler: (params, { runtime }) =>
        monicaRuntimeResult(() => nativeMetricsService(runtime).refresh(params))
    },
    (result) => (result.ok ? metricReadingFailureCode(result.value) : undefined)
  )
]
