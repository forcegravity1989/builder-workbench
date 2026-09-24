import { VersionDocumentError } from '../../shared/workbench/version-document'
import type { VersionMaterialResult } from '../../shared/workbench/version-material-request'

export class MaterialScopeError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export async function materialResult<T>(run: () => Promise<T>): Promise<VersionMaterialResult<T>> {
  try {
    return { ok: true, value: await run() }
  } catch (error) {
    if (error instanceof VersionDocumentError || error instanceof MaterialScopeError) {
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
