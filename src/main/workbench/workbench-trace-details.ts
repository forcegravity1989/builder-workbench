import { redactString } from '../observability/redactor'
import type { ActiveSpan } from '../observability/tracer'

const SAFE_LABEL = /^[a-z0-9][a-z0-9._-]{0,63}$/i

export function safeLabel(value: string | undefined, fallback: string): string {
  return value && SAFE_LABEL.test(value) ? value : fallback
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function traceStderrTail(stderr: string): string {
  // Keep credential prefixes and labels intact until the native scrubber sees them.
  return redactString(stderr).trim().slice(-400)
}

export function recordWorkbenchFailure(span: ActiveSpan, rawCode: string, message?: string): void {
  const code = safeLabel(rawCode, 'workbench-error')
  span.setAttribute('status', 'failed')
  span.setAttribute('errorCode', code)
  span.fail(message ? `${code}: ${message}` : code)
}
