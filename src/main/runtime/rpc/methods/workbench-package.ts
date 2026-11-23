import { defineWorkbenchMethod } from '../../../workbench/workbench-rpc-observability'
import {
  PackageDownloadSchema,
  PackageLatestSchema,
  PackageLaunchSchema,
  PackagePipelineListSchema
} from '../../../../shared/workbench/package-pipeline'
import { workbenchRuntimeResult } from '../../../workbench/workbench-runtime-result'
import { packagePipelineService } from '../../../workbench/package-pipeline-runtime'

export const WORKBENCH_PACKAGE_METHODS = [
  defineWorkbenchMethod({
    name: 'workbench.package.list',
    params: PackagePipelineListSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => packagePipelineService(runtime).list(params))
  }),
  defineWorkbenchMethod({
    name: 'workbench.package.latest',
    params: PackageLatestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => packagePipelineService(runtime).latest(params))
  }),
  defineWorkbenchMethod({
    name: 'workbench.package.launch',
    params: PackageLaunchSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => packagePipelineService(runtime).launch(params))
  }),
  defineWorkbenchMethod({
    name: 'workbench.package.download',
    params: PackageDownloadSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => packagePipelineService(runtime).download(params))
  })
]
