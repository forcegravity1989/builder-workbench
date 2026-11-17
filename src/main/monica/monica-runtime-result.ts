import { VersionDocumentError } from '../../shared/monica/version-document'
import type { VersionMaterialResult } from '../../shared/monica/version-material-request'
import { MetricCollectorError } from './metrics/collector-output'
import { HistorySourceError } from './version-history-snapshot'
import { PackagePipelineError } from './package-pipeline-error'
import { WorkspaceScopeError } from './workspace-scope-error'

type MonicaRuntimeError =
  | VersionDocumentError
  | WorkspaceScopeError
  | HistorySourceError
  | MetricCollectorError
  | PackagePipelineError

function isMonicaRuntimeError(error: unknown): error is MonicaRuntimeError {
  return (
    error instanceof VersionDocumentError ||
    error instanceof WorkspaceScopeError ||
    error instanceof HistorySourceError ||
    error instanceof MetricCollectorError ||
    error instanceof PackagePipelineError
  )
}

/**
 * One result envelope for every Monica runtime method: domain failures travel as
 * typed {ok:false} payloads the renderer ports already decode, while anything
 * unexpected keeps propagating to the RPC dispatcher.
 */
export async function monicaRuntimeResult<T>(
  run: () => Promise<T>
): Promise<VersionMaterialResult<T>> {
  try {
    return { ok: true, value: await run() }
  } catch (error) {
    if (isMonicaRuntimeError(error)) {
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
