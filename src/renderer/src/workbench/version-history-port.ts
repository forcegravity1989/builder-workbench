import {
  VersionHistoryListSchema,
  VersionHistoryReadSchema,
  VersionHistoryReadPlanSchema,
  VersionTreePlansSchema,
  type VersionHistoryPort,
  type VersionHistoryCatalog,
  type VersionHistoryPlan,
  type VersionTreePlanCatalog
} from '../../../shared/workbench/version-history'
import { callMetricRuntime } from './metric-runtime-rpc'

export function nativeVersionHistoryPort(runtimeOwnerEnvironmentId?: string): VersionHistoryPort {
  return {
    list(input) {
      const request = VersionHistoryListSchema.parse(input)
      return callMetricRuntime<VersionHistoryCatalog>(
        request.scope,
        runtimeOwnerEnvironmentId,
        'workbench.history.list',
        (scope) => ({ ...request, scope })
      )
    },
    listTreePlans(input) {
      const request = VersionTreePlansSchema.parse(input)
      return callMetricRuntime<VersionTreePlanCatalog>(
        request.scope,
        runtimeOwnerEnvironmentId,
        'workbench.history.listTreePlans',
        (scope) => ({ ...request, scope })
      )
    },
    read(input) {
      const request = VersionHistoryReadSchema.parse(input)
      return callMetricRuntime(
        request.scope,
        runtimeOwnerEnvironmentId,
        'workbench.history.read',
        (scope) => ({ ...request, scope })
      )
    },
    async readPlan(input) {
      const request = VersionHistoryReadPlanSchema.parse(input)
      const result = await callMetricRuntime<VersionHistoryPlan>(
        request.scope,
        runtimeOwnerEnvironmentId,
        'workbench.history.readPlan',
        (scope) => ({
          ...request,
          scope,
          planRef:
            request.planRef.kind === 'draft' &&
            request.planRef.sourceHostId === request.scope.hostId
              ? { ...request.planRef, sourceHostId: scope.hostId }
              : request.planRef
        })
      )
      if (result.source.kind === 'draft' && request.planRef.kind === 'draft') {
        return {
          ...result,
          planRef: request.planRef,
          source: { ...result.source, sourceHostId: request.planRef.sourceHostId }
        }
      }
      return result
    }
  }
}
