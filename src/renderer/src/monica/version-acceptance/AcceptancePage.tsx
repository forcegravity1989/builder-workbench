import { useMemo } from 'react'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import type { CycleEntry } from '../version-cycle/cycle-workspace-context'
import { nativePackagePipelinePort } from '../package-pipeline-port'
import { nativeVersionHistoryPort } from '../version-history-port'
import { AcceptanceBoard } from './AcceptanceBoard'
import { useMonicaScreenUsage } from '../monica-screen-usage'

/**
 * The native cycle shell supplies its real session and adapters at the navigation
 * boundary. No metrics port: v10 keeps metric evidence in the report only, so the
 * board has no metrics surface to feed.
 */
export function AcceptancePage({
  context,
  entry
}: {
  context: VersionCycleContext
  entry: CycleEntry
}) {
  const owner = context.scope?.runtimeOwnerEnvironmentId
  const history = useMemo(() => nativeVersionHistoryPort(owner), [owner])
  const packages = useMemo(() => nativePackagePipelinePort(owner), [owner])
  useMonicaScreenUsage('monica-acceptance', true)
  return <AcceptanceBoard context={context} history={history} packages={packages} entry={entry} />
}
