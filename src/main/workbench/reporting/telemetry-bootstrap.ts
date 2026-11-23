// Apply BW consent before initializing the native pipeline; inject the destination
// here so telemetry does not depend on workbench modules.

import type { Store } from '../../persistence'
import { setWorkbenchTelemetryTransport } from '../../telemetry/client'
import { shutdownTelemetryTransport, transportFetch } from './welink-telemetry-sink'

export function installWorkbenchTelemetryTransport(store: Store): void {
  applyWorkbenchTelemetryDefaultOff(store)
  setWorkbenchTelemetryTransport({
    fetch: transportFetch,
    shutdown: shutdownTelemetryTransport
  })
}

/** The marker preserves choices made after BW's initial default-off migration. */
export function applyWorkbenchTelemetryDefaultOff(store: Store): void {
  const telemetry = store.getSettings().telemetry
  if (!telemetry || telemetry.workbenchDefaultOffApplied === true) {
    return
  }
  // Deep-merge (persistence updateSettings) keeps installId / cohort markers.
  store.updateSettings({
    telemetry: { ...telemetry, optedIn: false, workbenchDefaultOffApplied: true }
  })
}
