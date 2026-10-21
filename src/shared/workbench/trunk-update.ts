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
  /** Fast-forward succeeded, or the tree already contained the trunk. */
  updated: boolean
  /** Commits fast-forwarded by this action; 0 = already up to date. */
  pulled: number
  /** Display ref of the baseline (pinned short form or main-checkout branch). */
  ref?: string
  /** Full SHA the target tree points at after a successful fast-forward. */
  commit?: string
  /** Unified Chinese refusal sentence when `updated` is false. */
  reason?: string
}
