import { useState } from 'react'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import type { CycleEntry } from '../version-cycle/cycle-workspace-context'
import { cycleStartedViewKey, hasCycleStarted, markCycleStarted } from '../cycle-view-state'
import type { usePlanningMaterial } from './use-planning-material'

/** The short entry card ends only after native launch succeeds or material has content. */
export function usePlanningStart({
  context,
  entry,
  material
}: {
  context: VersionCycleContext
  entry: CycleEntry
  material: ReturnType<typeof usePlanningMaterial>
}) {
  const plan = material.draft?.document
  const startVersion = context.version ?? context.boundVersion
  const startKey = cycleStartedViewKey({ ...context, version: startVersion })
  const [startedKey, setStartedKey] = useState<string | undefined>(undefined)
  const hasContent = Boolean(
    plan &&
    (plan.goals.length ||
      plan.tasks.length ||
      plan.minutes ||
      plan.workflow ||
      plan.summary.progress.trim() ||
      plan.summary.risks.trim())
  )
  const started =
    hasContent || hasCycleStarted(startKey) || (startKey !== undefined && startedKey === startKey)
  const start = async () => {
    const opened = await entry.start(startVersion)
    if (opened) {
      markCycleStarted(startKey)
      setStartedKey(startKey)
    }
  }
  return { startVersion, started, start }
}
