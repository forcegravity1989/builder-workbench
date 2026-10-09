import { useEffect } from 'react'
import type { FeatureInteractionId } from '../../../shared/feature-interactions'
import { useAppStore } from '@/store'

/**
 * Counts one interaction each time a surface becomes enabled after persisted UI hydrates.
 * Why: some features (Automations page, workspace agent sessions) are only counted here,
 * and feature-interaction usage telemetry reads these counts.
 */
export function useRecordFeatureUse(id: FeatureInteractionId, enabled: boolean): void {
  const persistedUIReady = useAppStore((s) => s.persistedUIReady)
  const recordFeatureInteraction = useAppStore((s) => s.recordFeatureInteraction)

  useEffect(() => {
    if (enabled && persistedUIReady) {
      void recordFeatureInteraction(id)
    }
  }, [enabled, id, persistedUIReady, recordFeatureInteraction])
}
