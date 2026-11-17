import { defineMonicaMethod } from '../../../monica/monica-rpc-observability'
import {
  VersionBindingScopeSchema,
  VersionBindingSetSchema
} from '../../../../shared/monica/version-binding'
import { materialResult } from '../../../monica/version-material-error'
import { nativeVersionBindingService } from '../../../monica/version-binding-service'

export const MONICA_VERSION_BINDING_METHODS = [
  defineMonicaMethod({
    name: 'workbench.versionBinding.read',
    params: VersionBindingScopeSchema,
    handler: (params, { runtime }) =>
      materialResult(() => nativeVersionBindingService(runtime).read(params))
  }),
  defineMonicaMethod({
    name: 'workbench.versionBinding.set',
    params: VersionBindingSetSchema,
    handler: (params, { runtime }) =>
      materialResult(() => nativeVersionBindingService(runtime).set(params))
  })
]
