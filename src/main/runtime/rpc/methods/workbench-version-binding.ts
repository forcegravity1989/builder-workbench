import { defineWorkbenchMethod } from '../../../workbench/workbench-rpc-observability'
import {
  VersionBindingScopeSchema,
  VersionBindingSetSchema
} from '../../../../shared/workbench/version-binding'
import { materialResult } from '../../../workbench/version-material-error'
import { nativeVersionBindingService } from '../../../workbench/version-binding-service'

export const WORKBENCH_VERSION_BINDING_METHODS = [
  defineWorkbenchMethod({
    name: 'workbench.versionBinding.read',
    permission: 'workspace',
    params: VersionBindingScopeSchema,
    handler: (params, { runtime }) =>
      materialResult(() => nativeVersionBindingService(runtime).read(params))
  }),
  defineWorkbenchMethod({
    name: 'workbench.versionBinding.set',
    permission: 'workspace',
    params: VersionBindingSetSchema,
    handler: (params, { runtime }) =>
      materialResult(() => nativeVersionBindingService(runtime).set(params))
  })
]
