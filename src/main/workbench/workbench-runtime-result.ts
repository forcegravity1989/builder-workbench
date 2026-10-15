import { VersionDocumentError } from '../../shared/workbench/version-document'
import type { VersionMaterialResult } from '../../shared/workbench/version-material-request'
import { MetricCollectorError } from './metrics/collector-output'
import { HistorySourceError } from './version-history-snapshot'
import { PackagePipelineError } from './cloud-dragon-session'
import { WorkspaceScopeError } from './workspace-scope-error'

type WorkbenchRuntimeError =
  | VersionDocumentError
  | WorkspaceScopeError
  | HistorySourceError
  | MetricCollectorError
  | PackagePipelineError

function isWorkbenchRuntimeError(error: unknown): error is WorkbenchRuntimeError {
  return (
    error instanceof VersionDocumentError ||
    error instanceof WorkspaceScopeError ||
    error instanceof HistorySourceError ||
    error instanceof MetricCollectorError ||
    error instanceof PackagePipelineError
  )
}

/**
 * One result envelope for every BW runtime method: domain failures travel as
 * typed {ok:false} payloads the renderer ports already decode, while anything
 * unexpected keeps propagating to the RPC dispatcher.
 */
export async function workbenchRuntimeResult<T>(
  run: () => Promise<T>
): Promise<VersionMaterialResult<T>> {
  try {
    return { ok: true, value: await run() }
  } catch (error) {
    if (isWorkbenchRuntimeError(error)) {
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
