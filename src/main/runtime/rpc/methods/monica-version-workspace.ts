import { defineMonicaMethod } from '../../../monica/monica-rpc-observability'
import { VersionWorkspacePrepareSchema } from '../../../../shared/monica/version-workspace-prepare'
import { materialResult } from '../../../monica/version-material-error'
import { nativeVersionWorkspacePrepare } from '../../../monica/version-workspace-prepare'

export const MONICA_VERSION_WORKSPACE_METHODS = [
  defineMonicaMethod({
    name: 'workbench.versionWorkspace.prepare',
    params: VersionWorkspacePrepareSchema,
    handler: (params, { runtime }) =>
      materialResult(() => nativeVersionWorkspacePrepare(runtime).prepare(params))
  })
]
