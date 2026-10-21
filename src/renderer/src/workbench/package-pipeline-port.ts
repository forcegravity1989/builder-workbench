import {
  PackageDownloadSchema,
  PackageLatestSchema,
  PackageLaunchSchema,
  PackagePipelineListSchema,
  type PackageDownloadReceipt,
  type PackageLaunchReceipt,
  type PackageLatest,
  type PackagePipelineCatalog,
  type PackagePipelinePort
} from '../../../shared/workbench/package-pipeline'
import { callMetricRuntime } from './metric-runtime-rpc'

/** Pass the owner of the selected native worktree, including paired-runtime ownership. */
export function nativePackagePipelinePort(runtimeOwnerEnvironmentId?: string): PackagePipelinePort {
  return {
    list(input) {
      const request = PackagePipelineListSchema.parse(input)
      return callMetricRuntime<PackagePipelineCatalog>(
        request.scope,
        runtimeOwnerEnvironmentId,
        'workbench.package.list',
        (scope) => ({ ...request, scope }),
        150_000
      )
    },
    latest(input) {
      const request = PackageLatestSchema.parse(input)
      return callMetricRuntime<PackageLatest | null>(
        request.scope,
        runtimeOwnerEnvironmentId,
        'workbench.package.latest',
        (scope) => ({ ...request, scope }),
        150_000
      )
    },
    launch(input) {
      const request = PackageLaunchSchema.parse(input)
      return callMetricRuntime<PackageLaunchReceipt>(
        request.scope,
        runtimeOwnerEnvironmentId,
        'workbench.package.launch',
        (scope) => ({ ...request, scope }),
        240_000
      )
    },
    download(input) {
      const request = PackageDownloadSchema.parse(input)
      return callMetricRuntime<PackageDownloadReceipt>(
        request.scope,
        runtimeOwnerEnvironmentId,
        'workbench.package.download',
        (scope) => ({ ...request, scope }),
        330_000
      )
    }
  }
}
