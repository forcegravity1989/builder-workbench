import { useMemo } from 'react'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import type { CycleEntry } from '../version-cycle/cycle-workspace-context'
import { nativeMetricsPort } from '../metrics-port'
import { nativeVersionHistoryPort } from '../version-history-port'
import { AcceptanceBoard } from './AcceptanceBoard'

/** The native cycle shell supplies its real session and adapters at the navigation boundary. */
export function AcceptancePage({
  context,
  entry
}: {
  context: VersionCycleContext
  entry: CycleEntry
}) {
  const owner = context.scope?.runtimeOwnerEnvironmentId
  const metrics = useMemo(() => nativeMetricsPort(owner), [owner])
  const history = useMemo(() => nativeVersionHistoryPort(owner), [owner])
  return <AcceptanceBoard context={context} history={history} metrics={metrics} entry={entry} />
}
