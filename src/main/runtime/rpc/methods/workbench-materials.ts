import { defineMethod } from '../core'
import {
  VersionMaterialReadSchema,
  VersionMaterialSaveSchema,
  VersionMaterialScopeSchema
} from '../../../../shared/workbench/version-material-request'
import { materialResult } from '../../../workbench/version-material-service'

export const WORKBENCH_MATERIAL_METHODS = [
  defineMethod({
    name: 'workbench.materials.list',
    params: VersionMaterialScopeSchema,
    handler: (params, { runtime }) => materialResult(() => runtime.versionMaterials().list(params))
  }),
  defineMethod({
    name: 'workbench.materials.read',
    params: VersionMaterialReadSchema,
    handler: (params, { runtime }) => materialResult(() => runtime.versionMaterials().read(params))
  }),
  defineMethod({
    name: 'workbench.materials.save',
    params: VersionMaterialSaveSchema,
    handler: (params, { runtime }) => materialResult(() => runtime.versionMaterials().save(params))
  })
]
