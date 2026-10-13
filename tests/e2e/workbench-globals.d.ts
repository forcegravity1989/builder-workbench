import type { StoreApi } from 'zustand'
import type { AppState } from '../../src/renderer/src/store'

declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- Augmenting the global Window requires interface merging; a type alias would shadow lib.dom's Window instead of extending it.
  interface Window {
    /** Exposed only by the Electron `e2e` build for deterministic fixture setup. */
    __store?: StoreApi<AppState>
  }
}

export {}
