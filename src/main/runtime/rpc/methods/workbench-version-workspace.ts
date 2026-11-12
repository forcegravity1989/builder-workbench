import { defineWorkbenchMethod } from '../../../workbench/workbench-rpc-observability'
import { VersionWorkspacePrepareSchema } from '../../../../shared/workbench/version-workspace-prepare'
import { materialResult } from '../../../workbench/version-material-error'
import { nativeVersionWorkspacePrepare } from '../../../workbench/version-workspace-prepare'

export const WORKBENCH_VERSION_WORKSPACE_METHODS = [
  defineWorkbenchMethod({
    name: 'workbench.versionWorkspace.prepare',
    params: VersionWorkspacePrepareSchema,
    handler: (params, { runtime }) =>
      materialResult(() => nativeVersionWorkspacePrepare(runtime).prepare(params))
  })
]
