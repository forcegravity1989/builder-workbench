import { useState } from 'react'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import type { CycleEntry } from '../version-cycle/cycle-workspace-context'
import { cycleStartedViewKey, hasCycleStarted, markCycleStarted } from '../cycle-view-state'
import { materialProblemRequest } from '../version-cycle/cycle-start-request'
import type { usePlanningMaterial } from './use-planning-material'
import type { usePriorCarryovers } from './use-prior-carryovers'

/** The short entry card ends only after native launch succeeds or material has content. */
export function usePlanningStart({
  context,
  entry,
  material,
  priorState,
  priorError
}: {
  context: VersionCycleContext
  entry: CycleEntry
  material: ReturnType<typeof usePlanningMaterial>
  priorState: ReturnType<typeof usePriorCarryovers>['state']
  priorError: string | null
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
  const problems = material.versions.filter((item) => item.state !== 'ready')
  const start = async () => {
    const version = startVersion
    const opened = await entry.start(
      [
        version ? `本次计划版本：${version}。请读取该版本的当前材料并继续协作。` : '',
        problems.length ? materialProblemRequest(problems, 'plan', version) : '',
        priorState.kind === 'missing'
          ? `上版 ${priorState.version} 尚未完成验收，回顾暂为空；不改用更早版本。`
          : '',
        priorError ? `上版验收来源需要核对：${priorError}` : ''
      ]
        .filter(Boolean)
        .join('\n') || undefined
    )
    if (opened) {
      markCycleStarted(startKey)
      setStartedKey(startKey)
    }
  }
  return { startVersion, started, start }
}
