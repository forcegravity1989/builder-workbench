import { withSpan, type ActiveSpan } from '../observability/tracer'
import { recordWorkbenchFailure, safeLabel } from './workbench-trace-details'

export type PhaseMarker = (phase: string) => void

/** A mark opens a phase, measured until the next mark or the end of the operation. */
export function withPhaseSpan<T>(
  name: string,
  fn: (span: ActiveSpan, mark: PhaseMarker) => Promise<T>,
  failureCode?: (result: T) => string | undefined
): Promise<T> {
  return withSpan(
    name,
    async (span) => {
      let open: { phase: string; at: number } | undefined
      const closeOpen = (): void => {
        if (open) {
          span.setAttribute(`${open.phase}Ms`, performance.now() - open.at)
        }
      }
      const mark: PhaseMarker = (phase) => {
        closeOpen()
        const label = safeLabel(phase, 'phase')
        span.addEvent(`phase.${label}`)
        open = { phase: label, at: performance.now() }
      }
      let result: T
      try {
        result = await fn(span, mark)
      } finally {
        closeOpen()
      }
      const code = failureCode?.(result)
      if (code !== undefined) {
        recordWorkbenchFailure(span, code)
      }
      return result
    },
    { kind: 'internal' }
  )
}
