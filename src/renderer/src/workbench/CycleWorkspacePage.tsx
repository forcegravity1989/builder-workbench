import type React from 'react'
import { useCycleView } from './cycle-view-state'
import { CycleWorkspaceShell } from './version-cycle/CycleWorkspaceShell'

/**
 * The BW artifacts-slot page: one remount per workflow so only the visible
 * screen publishes the global terminal portal (single-publisher rule).
 */
export function CycleWorkspacePage(): React.JSX.Element {
  const view = useCycleView()
  return <CycleWorkspaceShell key={view} workflow={view === 'plan' ? 'plan' : 'acceptance'} />
}
