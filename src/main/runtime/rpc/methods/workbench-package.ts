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
    handler: (params) => workbenchRuntimeResult(() => packagePipelineService().list(params))
  }),
  defineMethod({
    name: 'workbench.package.latest',
    params: PackageLatestSchema,
    handler: (params) => workbenchRuntimeResult(() => packagePipelineService().latest(params))
  }),
  defineMethod({
    name: 'workbench.package.launch',
    params: PackageLaunchSchema,
    handler: (params) => workbenchRuntimeResult(() => packagePipelineService().launch(params))
  }),
  defineMethod({
    name: 'workbench.package.download',
    params: PackageDownloadSchema,
    handler: (params) => workbenchRuntimeResult(() => packagePipelineService().download(params))
  })
]
