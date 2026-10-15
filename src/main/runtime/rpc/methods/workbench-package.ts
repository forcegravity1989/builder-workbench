import { defineMethod } from '../core'
import {
  PackageDownloadSchema,
  PackageLatestSchema,
  PackageLaunchSchema,
  PackagePipelineListSchema
} from '../../../../shared/workbench/package-pipeline'
import { workbenchRuntimeResult } from '../../../workbench/workbench-runtime-result'
import { packagePipelineService } from '../../../workbench/package-pipeline-runtime'

export const WORKBENCH_PACKAGE_METHODS = [
  defineMethod({
    name: 'workbench.package.list',
    params: PackagePipelineListSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => packagePipelineService(runtime).list(params))
  }),
  defineMethod({
    name: 'workbench.package.latest',
    params: PackageLatestSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => packagePipelineService(runtime).latest(params))
  }),
  defineMethod({
    name: 'workbench.package.launch',
    params: PackageLaunchSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => packagePipelineService(runtime).launch(params))
  }),
  defineMethod({
    name: 'workbench.package.download',
    params: PackageDownloadSchema,
    handler: (params, { runtime }) =>
      workbenchRuntimeResult(() => packagePipelineService(runtime).download(params))
  })
]
