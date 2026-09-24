import { createVersionMaterialPort } from '../../../shared/workbench/version-material-client'
import type { VersionMaterialScope } from '../../../shared/workbench/version-material-request'

export function nativeVersionMaterialPort(scope: VersionMaterialScope) {
  return createVersionMaterialPort(scope, (args) => window.api.runtime.call(args))
}
