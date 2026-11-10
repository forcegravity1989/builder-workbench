// Top-level troubleshooting spans for every BW RPC method (Issue #553, 第二件 A 档).
// Why: BW overlay operations were invisible in the native trace — failures lived
// only in the in-memory result envelope and vanished with the toast. The span name
// reuses the RPC method name (`workbench.<domain>.<action>`), so BW traffic is
// filterable in the NDJSON trace without a separate kind registry.
//
// Attribute policy follows the native instrumentation convention (source-side
// avoidance, see observability/instrumentation.ts git.exec): closed-vocabulary
// attributes only (`status`, `errorCode`) — never params values or free text in
// attributes. Error detail travels in `exit.cause`, which `redactSpan` scrubs
// with the credential rules before it reaches the sink.
//
// Envelope coverage: both BW result funnels (`workbenchRuntimeResult` and
// `materialResult`) convert typed domain errors into `{ ok: false, error: { code,
// message } }` payloads that never throw, so the wrapper inspects the returned
// envelope instead of relying on exceptions alone.

import type { ZodType } from 'zod'
import { defineMethod, type RpcTypedMethod } from '../runtime/rpc/core'
import { withSpan, type ActiveSpan } from '../observability/tracer'

// Same shape as the skill-observability precedent: error codes are stable
// machine labels; anything else is a bug in the error class, not a span value.
const SAFE_ERROR_CODE = /^[a-z0-9][a-z0-9._-]{0,63}$/i
const FALLBACK_ERROR_CODE = 'workbench-error'

type EnvelopeFailure = { error: { code?: unknown; message?: unknown } }

function asEnvelopeFailure(result: unknown): EnvelopeFailure | null {
  if (typeof result !== 'object' || result === null) {
    return null
  }
  const candidate = result as { ok?: unknown; error?: unknown }
  if (candidate.ok !== false || typeof candidate.error !== 'object' || candidate.error === null) {
    return null
  }
  return candidate as EnvelopeFailure
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function recordEnvelopeFailure(span: ActiveSpan, failure: EnvelopeFailure): void {
  const rawCode = failure.error.code
  const code =
    typeof rawCode === 'string' && SAFE_ERROR_CODE.test(rawCode) ? rawCode : FALLBACK_ERROR_CODE
  span.setAttribute('status', 'failed')
  span.setAttribute('errorCode', code)
  const message = typeof failure.error.message === 'string' ? failure.error.message : ''
  // span.fail() is terminal and idempotent, so the surrounding withSpan's
  // end() after a normal return is a no-op.
  span.fail(message ? `${code}: ${message}` : code)
}

/**
 * Define a BW RPC method with its top-level trace span. Drop-in replacement
 * for `defineMethod` in `runtime/rpc/methods/workbench-*.ts`: the handler may
 * stay sync or async and keeps its own result envelope; the returned method's
 * result type widens to `Promise<Awaited<TResult>>` because the span wrapper
 * is always async.
 */
export function defineWorkbenchMethod<
  TName extends string,
  TSchema extends ZodType | null,
  TResult
>(
  spec: RpcTypedMethod<TName, TSchema, TResult>
): RpcTypedMethod<TName, TSchema, Promise<Awaited<TResult>>> {
  const method = defineMethod(spec)
  return {
    name: method.name,
    params: method.params,
    // Why Promise.resolve instead of an async lambda: its lib signature
    // `resolve<T>(value: T): Promise<Awaited<T>>` pins the unwrap that tsc
    // cannot infer from `await` on an unconstrained TResult.
    handler: (params, ctx) =>
      withSpan<Awaited<TResult>>(
        method.name,
        (span) =>
          Promise.resolve(method.handler(params, ctx)).then(
            (result) => {
              const failure = asEnvelopeFailure(result)
              if (failure) {
                recordEnvelopeFailure(span, failure)
              }
              return result
            },
            (error: unknown) => {
              // Cancellation is an Interrupted exit, not a Failure — mirrors the
              // skill-observability convention so triage can filter real errors.
              if (isAbortError(error)) {
                span.interrupt('workbench-rpc-cancelled')
              }
              throw error
            }
          ),
        { kind: 'server' }
      )
  }
}
