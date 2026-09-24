import { defineMethod } from '../core'
import {
  VersionMaterialReadSchema,
  VersionMaterialSaveSchema,
  VersionMaterialScopeSchema
} from '../../../../shared/workbench/version-material-request'
import { materialResult } from '../../../workbench/version-material-error'
import { nativeVersionMaterialService } from '../../../workbench/version-material-runtime'

export const WORKBENCH_MATERIAL_METHODS = [
  defineMethod({
    name: 'workbench.materials.list',
    params: VersionMaterialScopeSchema,
    handler: (params, { runtime }) =>
      materialResult(() => nativeVersionMaterialService(runtime).list(params))
  }),
  defineMethod({
    name: 'workbench.materials.read',
    params: VersionMaterialReadSchema,
    handler: (params, { runtime }) =>
      materialResult(() => nativeVersionMaterialService(runtime).read(params))
  }),
  defineMethod({
    name: 'workbench.materials.save',
    params: VersionMaterialSaveSchema,
    handler: (params, { runtime }) =>
      materialResult(() => nativeVersionMaterialService(runtime).save(params))
  })
]
