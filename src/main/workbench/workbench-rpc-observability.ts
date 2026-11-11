import type { ZodType } from 'zod'
import { defineMethod, type RpcTypedMethod } from '../runtime/rpc/core'
import { withSpan } from '../observability/tracer'
import { isAbortError, recordWorkbenchFailure } from './workbench-trace-details'

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

/** Trace domain failures that are returned to the caller as values. */
export function defineWorkbenchMethod<
  TName extends string,
  TSchema extends ZodType | null,
  TResult
>(
  spec: RpcTypedMethod<TName, TSchema, TResult>,
  failureCode?: (result: Awaited<TResult>) => string | undefined
): RpcTypedMethod<TName, TSchema, Promise<Awaited<TResult>>> {
  const method = defineMethod(spec)
  return {
    name: method.name,
    params: method.params,
    handler: (params, ctx) =>
      withSpan<Awaited<TResult>>(
        method.name,
        async (span) => {
          try {
            const result = await Promise.resolve(method.handler(params, ctx))
            const failure = asEnvelopeFailure(result)
            if (failure) {
              const { code, message } = failure.error
              recordWorkbenchFailure(
                span,
                typeof code === 'string' ? code : 'workbench-error',
                typeof message === 'string' ? message : undefined
              )
            } else {
              const code = failureCode?.(result)
              if (code !== undefined) {
                recordWorkbenchFailure(span, code)
              }
            }
            return result
          } catch (error) {
            if (isAbortError(error)) {
              span.interrupt('workbench-rpc-cancelled')
            }
            throw error
          }
        },
        { kind: 'server' }
      )
  }
}
