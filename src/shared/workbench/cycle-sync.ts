import { z } from 'zod'
import { MetricScopeSchema } from './metrics'

export const CycleSyncSchema = z.strictObject({ scope: MetricScopeSchema })

/**
 * Result of syncing the adopted trunk into a cycle branch on screen entry.
 * `synced: false` is an honest skip or failure with a human-readable reason;
 * the boards keep reading the branch as-is and never switch data sources.
 */
export type CycleSyncResult = {
  synced: boolean
  reason?: string
}
