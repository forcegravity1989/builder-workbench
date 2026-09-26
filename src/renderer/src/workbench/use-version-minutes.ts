import { useEffect, useState } from 'react'
import type { NativeWorkspaceScope } from './version-cycle/native-workspace'
import { nativeVersionHistoryPort } from './version-history-port'
import { nativeVersionMaterialPort } from './version-material-port'
import type {
  VersionHistoryCatalog,
  VersionHistorySource
} from '../../../shared/workbench/version-history'
import {
  PlanningMaterialSchema,
  type AcceptanceMaterial,
  type PlanningMaterial
} from '../../../shared/workbench/version-material'
import { derivePlanMinutes } from './version-planning/plan-summary'

/** Minutes of one archived/live version, derived from the stored material — never re-collected. */
export type VersionMinutes = {
  version: string
  plan: { text: string; source: string } | null
  acceptance: {
    document: AcceptanceMaterial
    source: string
  } | null
  planDocument: PlanningMaterial | null
}

export function taskDistribution(document: AcceptanceMaterial): [string, number][] {
  const counts = new Map<string, number>()
  for (const item of document.taskSnapshot ?? []) {
    if (item.kind !== 'ready') {
      continue
    }
    counts.set(item.state, (counts.get(item.state) ?? 0) + 1)
  }
  return [...counts.entries()]
}

/** Loads the stored plan/acceptance material for one version: archive record first, live material for the current selection. */
export function useVersionMinutes({
  baseScope,
  baseWorktreeId,
  history,
  currentVersion,
  version
}: {
  baseScope: NativeWorkspaceScope | null
  baseWorktreeId: string | null
  history: VersionHistoryCatalog | null
  currentVersion: string | null
  version: string | null
}): VersionMinutes | null {
  const [minutes, setMinutes] = useState<VersionMinutes | null>(null)
  useEffect(() => {
    if (!baseScope || !baseWorktreeId || !version) {
      setMinutes(null)
      return
    }
    const scope = {
      repoId: baseScope.repoId,
      worktreeId: baseWorktreeId,
      hostId: baseScope.hostId
    }
    const owner = baseScope.runtimeOwnerEnvironmentId
    let cancelled = false
    const latest = (workflow: 'plan' | 'acceptance'): VersionHistorySource | undefined =>
      (history?.records ?? [])
        .filter((item) => item.version === version && item.workflow === workflow)
        .sort((a, b) => b.committedAt.localeCompare(a.committedAt))[0]
    void (async () => {
      const historyPort = nativeVersionHistoryPort(owner)
      const planRecord = latest('plan')
      const acceptanceRecord = latest('acceptance')
      let planDocument: PlanningMaterial | null = null
      let planColumn: VersionMinutes['plan'] = null
      if (planRecord) {
        try {
          const read = await historyPort.read({
            scope,
            sourceCommit: planRecord.sourceCommit,
            version,
            cycleId: planRecord.cycleId,
            workflow: 'plan'
          })
          planDocument = read.document as PlanningMaterial
          planColumn = {
            text: derivePlanMinutes(planDocument),
            source: `归档 ${planRecord.sourceCommit.slice(0, 12)} · ${planRecord.committedAt}`
          }
        } catch {
          planColumn = null
        }
      } else if (version === currentVersion) {
        try {
          const live = await nativeVersionMaterialPort({ ...scope, workflow: 'plan' }, owner).read(
            version
          )
          if (live) {
            planDocument = PlanningMaterialSchema.parse(live.document)
            planColumn = {
              text: derivePlanMinutes(planDocument),
              source: '当前材料（未归档）'
            }
          }
        } catch {
          planColumn = null
        }
      }
      let acceptanceColumn: VersionMinutes['acceptance'] = null
      if (acceptanceRecord) {
        try {
          const read = await historyPort.read({
            scope,
            sourceCommit: acceptanceRecord.sourceCommit,
            version,
            cycleId: acceptanceRecord.cycleId,
            workflow: 'acceptance'
          })
          acceptanceColumn = {
            document: read.document as AcceptanceMaterial,
            source: `归档 ${acceptanceRecord.sourceCommit.slice(0, 12)} · ${acceptanceRecord.committedAt}`
          }
        } catch {
          acceptanceColumn = null
        }
      }
      if (!cancelled) {
        setMinutes({ version, plan: planColumn, acceptance: acceptanceColumn, planDocument })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [baseScope, baseWorktreeId, history, currentVersion, version])
  return minutes
}
