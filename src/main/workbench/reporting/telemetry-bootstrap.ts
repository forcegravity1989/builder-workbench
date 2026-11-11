// BW #553(决策⑧ 修订)bootstrap: Workbench telemetry is opt-in — default
// off, and when the user opts in, events land in the WeLink group space
// (welink-telemetry-sink) instead of PostHog. Two jobs, both before
// `initTelemetry` runs (main-process-observers):
//
//   1. Inject the transport (dependency-injection direction: workbench →
//      telemetry, keeping src/main/telemetry free of workbench imports —
//      lane isolation per observability/architecture.test.ts).
//   2. Normalize consent to default-off, once per install. The native cohort
//      migration defaults NEW installs to `optedIn: true` (loaded-cohort-
//      migrations.ts), which in Orca means "collect unless the banner says
//      otherwise". Scope is every BW profile without the marker — not just
//      fresh installs: BW never shipped collection, so no `true`/`null` on
//      disk (including legacy profiles) can be an explicit informed choice;
//      the marker makes the normalization one-shot — afterwards the user's
//      choice (including opt-in) survives restarts untouched.

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

/** Exported for tests: the one-shot default-off normalization contract. */
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
