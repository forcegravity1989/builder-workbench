import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import type { FeatureInteractionId } from '../../../shared/feature-interaction-catalog'

/**
 * Counts one feature interaction each time a Monica screen becomes the user's
 * current surface, re-arming after it stops being so. Data-loading states
 * don't gate the count — entering the screen is the usage.
 *
 * The count waits for persisted UI readiness like useContextualTour does, so a
 * screen entered during boot is still counted once persistence is ready.
 */
export function useMonicaScreenUsage(id: FeatureInteractionId, active: boolean): void {
  const persistedUIReady = useAppStore((s) => s.persistedUIReady)
  const counted = useRef(false)

  useEffect(() => {
    if (!active) {
      counted.current = false
      return
    }
    if (!persistedUIReady || counted.current) {
      return
    }
    counted.current = true
    void useAppStore.getState().recordFeatureInteraction(id)
  }, [active, persistedUIReady, id])
}
