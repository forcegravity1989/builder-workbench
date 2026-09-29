import {
  MetricScopeSchema,
  MetricReadRequestSchema,
  type MetricCatalog,
  type MetricReading,
  type MetricsPort
} from '../../../shared/workbench/metrics'
import { callMetricRuntime } from './metric-runtime-rpc'

/** Pass the owner of the selected native worktree, including paired-runtime ownership. */
export function nativeMetricsPort(runtimeOwnerEnvironmentId?: string): MetricsPort {
  return {
    async list(input) {
      const scope = MetricScopeSchema.parse(input)
      const catalog = await callMetricRuntime<MetricCatalog>(
        scope,
        runtimeOwnerEnvironmentId,
        'workbench.metrics.list',
        (ownerScope) => ownerScope,
        90_000
      )
      return { ...catalog, scope }
    },
    read(input) {
      const request = MetricReadRequestSchema.parse(input)
      return callMetricRuntime<MetricReading>(
        request.scope,
        runtimeOwnerEnvironmentId,
        'workbench.metrics.read',
        (scope) => ({ ...request, scope })
      )
    },
    refresh(input) {
      const request = MetricReadRequestSchema.parse(input)
      return callMetricRuntime<MetricReading>(
        request.scope,
        runtimeOwnerEnvironmentId,
        'workbench.metrics.refresh',
        (scope) => ({ ...request, scope }),
        910_000
      )
    }
  }
}
