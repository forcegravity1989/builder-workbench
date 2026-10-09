import type { UISlice, UISliceGet, UISliceSet } from './ui-slice-contract'
import { mergeFeatureInteractionState } from './ui-slice-hydration-values'
import type { FeatureInteractionState } from '../../../../../shared/feature-interactions'

export function createUiFeatureActions(set: UISliceSet, _get: UISliceGet): Partial<UISlice> {
  return {
    featureInteractions: {},
    recordFeatureInteraction: (id) => {
      let persistPromise = Promise.resolve()
      set((s) => {
        if (!s.persistedUIReady) {
          return s
        }
        const existing = s.featureInteractions[id]
        const next: FeatureInteractionState = {
          ...s.featureInteractions,
          [id]: {
            firstInteractedAt: existing?.firstInteractedAt ?? Date.now(),
            interactionCount: (existing?.interactionCount ?? 0) + 1
          }
        }
        if (typeof window !== 'undefined') {
          const recordInteraction = window.api.ui.recordFeatureInteraction
          const persist = recordInteraction
            ? recordInteraction(id).then((ui) => {
                set((current) => ({
                  featureInteractions: mergeFeatureInteractionState(
                    current.featureInteractions,
                    ui.featureInteractions
                  )
                }))
              })
            : window.api.ui.set({ featureInteractions: next })
          persistPromise = persist.catch(console.error)
        }
        return { featureInteractions: next }
      })
      return persistPromise
    }
  }
}
