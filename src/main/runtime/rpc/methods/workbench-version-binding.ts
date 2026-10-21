import { defineMethod } from '../core'
import {
  VersionBindingScopeSchema,
  VersionBindingSetSchema
} from '../../../../shared/workbench/version-binding'
import { materialResult } from '../../../workbench/version-material-error'
import { nativeVersionBindingService } from '../../../workbench/version-binding-service'

export const WORKBENCH_VERSION_BINDING_METHODS = [
  defineMethod({
    name: 'workbench.versionBinding.read',
    params: VersionBindingScopeSchema,
    handler: (params, { runtime }) =>
      materialResult(() => nativeVersionBindingService(runtime).read(params))
  }),
  defineMethod({
    name: 'workbench.versionBinding.set',
    params: VersionBindingSetSchema,
    handler: (params, { runtime }) =>
      materialResult(() => nativeVersionBindingService(runtime).set(params))
  })
]
