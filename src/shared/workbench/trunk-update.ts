import { z } from 'zod'
import { MetricScopeSchema } from './metrics'

export const TrunkUpdateSchema = z.strictObject({ scope: MetricScopeSchema })

/**
 * Result of the one code-sync entry: a screen's「更新代码」button. The system
 * never syncs on its own — entering a screen is read-only. `updated: false` is
 * an honest refusal carrying the unified one-sentence reason; the tree stays
 * exactly as it was and the boards re-read their materials anyway.
 */
export type TrunkUpdateResult = {
  /** Fast-forward/merge succeeded, or the tree already contained the trunk. */
  updated: boolean
  /** Commits brought in by this action; 0 = already up to date. */
  pulled: number
  /** Display ref of the target (pinned short form, main branch, or flow branch). */
  ref?: string
  /** Full SHA the target tree points at after a successful sync. */
  commit?: string
  /** Sync merged the trunk into a flow branch (vs. a main-checkout fast-forward). */
  merged?: boolean
  /** Unified Chinese refusal sentence when `updated` is false. */
  reason?: string
}
