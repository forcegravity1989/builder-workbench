import { VersionDocumentError } from '../../shared/workbench/version-document'
import type { VersionMaterialResult } from '../../shared/workbench/version-material-request'

import { WorkspaceScopeError } from './workspace-scope-error'

export async function materialResult<T>(run: () => Promise<T>): Promise<VersionMaterialResult<T>> {
  try {
    return { ok: true, value: await run() }
  } catch (error) {
    if (error instanceof VersionDocumentError || error instanceof WorkspaceScopeError) {
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error instanceof VersionDocumentError && error.currentRevision !== undefined
            ? { currentRevision: error.currentRevision }
            : {})
        }
      }
    }
    throw error
  }
}
