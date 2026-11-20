import { defineMonicaMethod } from '../../../monica/monica-rpc-observability'
import {
  PackageDownloadSchema,
  PackageLatestSchema,
  PackageLaunchSchema,
  PackagePipelineListSchema
} from '../../../../shared/monica/package-pipeline'
import { monicaRuntimeResult } from '../../../monica/monica-runtime-result'
import { packagePipelineService } from '../../../monica/package-pipeline-runtime'

export const MONICA_PACKAGE_METHODS = [
  defineMonicaMethod({
    name: 'workbench.package.list',
    params: PackagePipelineListSchema,
    handler: (params, { runtime }) =>
      monicaRuntimeResult(() => packagePipelineService(runtime).list(params))
  }),
  defineMonicaMethod({
    name: 'workbench.package.latest',
    params: PackageLatestSchema,
    handler: (params, { runtime }) =>
      monicaRuntimeResult(() => packagePipelineService(runtime).latest(params))
  }),
  defineMonicaMethod({
    name: 'workbench.package.launch',
    params: PackageLaunchSchema,
    handler: (params, { runtime }) =>
      monicaRuntimeResult(() => packagePipelineService(runtime).launch(params))
  }),
  defineMonicaMethod({
    name: 'workbench.package.download',
    params: PackageDownloadSchema,
    handler: (params, { runtime }) =>
      monicaRuntimeResult(() => packagePipelineService(runtime).download(params))
  })
]
