// Phase-attribution helper for BW multi-stage flows (Issue #553 第二件 C 档).
// Precedent: instrumentation.ts addWorktreeCreatePhaseAttributes — phases ride
// as bounded attributes/events on the flow's own span instead of inventing a
// span per step, so the trace tree stays shallow and the 900s collector window
// decomposes into `${phase}Ms` attributes plus the existing child spans
// (sampled git.exec from the git runner, workbench.collector.exec /
// workbench.gh.exec from the B 档 wrappers).
//
// mark('x') OPENS phase x (start convention): the interval until the next
// mark — or span end / failure — is recorded under `xMs`. Call sites must
// mark BEFORE the work they name; the protocol test locks label↔work
// correspondence with controlled delays.

import { withSpan, type ActiveSpan } from '../observability/tracer'
import { safeLabel } from './workbench-exec-observability'

export type PhaseMarker = (phase: string) => void

const safePhase = (value: string): string => safeLabel(value, 'phase')

export function withPhaseSpan<T>(
  name: string,
  fn: (span: ActiveSpan, mark: PhaseMarker) => Promise<T>,
  attributes: Record<string, unknown> = {}
): Promise<T> {
  return withSpan(
    name,
    async (span) => {
      for (const [key, value] of Object.entries(attributes)) {
        span.setAttribute(key, value)
      }
      // Why a holder object: TS flow analysis does not track assignments made
      // inside the mark() closure, so a bare `let` narrows to never after the
      // await; property reads are re-narrowed from the declared type instead.
      const holder: { open: { phase: string; at: number } | null } = { open: null }
      const closeOpen = (): void => {
        if (holder.open) {
          // Clamp like the native precedent's unattributed_ms: NTP clock
          // steps must not produce negative durations.
          span.setAttribute(
            `${safePhase(holder.open.phase)}Ms`,
            Math.max(0, Date.now() - holder.open.at)
          )
        }
      }
      const mark: PhaseMarker = (phase) => {
        closeOpen()
        span.addEvent(`phase.${safePhase(phase)}`)
        holder.open = { phase: safePhase(phase), at: Date.now() }
      }
      try {
        const result = await fn(span, mark)
        closeOpen()
        return result
      } catch (error) {
        // Close on failure too so the in-flight phase duration survives on
        // the Failure span instead of vanishing with the throw.
        closeOpen()
        throw error
      }
    },
    { kind: 'internal' }
  )
}
