import { useEffect, useState } from 'react'
import type { NativeWorkspaceScope } from './version-cycle/native-workspace'
import { nativeVersionHistoryPort } from './version-history-port'
import { nativeVersionMaterialPort } from './version-material-port'
import type { VersionHistoryCatalog } from '../../../shared/workbench/version-history'
import {
  AcceptanceMaterialSchema,
  PlanningMaterialSchema,
  type AcceptanceMaterial,
  type PlanningMaterial
} from '../../../shared/workbench/version-material'
import { derivePlanMinutes } from './version-planning/plan-summary'

export type VersionMinutes = {
  version: string
  cycle: string
  loading: boolean
  plan: { text: string; source: string; draft: boolean } | null
  acceptance: { document: AcceptanceMaterial; source: string; draft: boolean } | null
  planDocument: PlanningMaterial | null
  planError: string | null
  acceptanceError: string | null
}
export type MinutesInput = {
  baseScope: NativeWorkspaceScope | null
  baseWorktreeId: string | null
  planWorktreeId: string | null
  acceptanceWorktreeId: string | null
  history: VersionHistoryCatalog | null
  currentVersion: string | null
  version: string | null
  cycle: string
}
export function taskDistribution(document: AcceptanceMaterial): [string, number][] {
  const counts = new Map<string, number>()
  for (const item of document.taskSnapshot ?? []) {
    if (item.kind === 'ready') {
      counts.set(item.state, (counts.get(item.state) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
}
function emptyMinutes(version: string, cycle: string): VersionMinutes {
  return {
    version,
    cycle,
    loading: true,
    plan: null,
    acceptance: null,
    planDocument: null,
    planError: null,
    acceptanceError: null
  }
}
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
export async function readVersionMinutes(input: MinutesInput): Promise<VersionMinutes | null> {
  const { baseScope, baseWorktreeId, version, cycle, history } = input
  if (!baseScope || !baseWorktreeId || !version) {
    return null
  }
  const result = emptyMinutes(version, cycle)
  const owner = baseScope.runtimeOwnerEnvironmentId
  const scope = { repoId: baseScope.repoId, worktreeId: baseWorktreeId, hostId: baseScope.hostId }
  const port = nativeVersionHistoryPort(owner)
  const records = (history?.records ?? [])
    .filter((item) => item.version === version && item.cycleId === cycle)
    .sort((a, b) => b.committedAt.localeCompare(a.committedAt))
  const planRecord = records.find((item) => item.workflow === 'plan')
  const acceptanceRecord = records.find((item) => item.workflow === 'acceptance')
  const live = cycle === 'current' && version === input.currentVersion
  let revision: string | null = null
  try {
    const snapshot = live
      ? input.planWorktreeId
        ? await nativeVersionMaterialPort(
            { ...scope, worktreeId: input.planWorktreeId, workflow: 'plan' },
            owner
          ).read(version)
        : null
      : planRecord
        ? await port.read({
            scope,
            sourceCommit: planRecord.sourceCommit,
            version,
            cycleId: planRecord.cycleId,
            workflow: planRecord.workflow
          })
        : null
    if (snapshot) {
      result.planDocument = PlanningMaterialSchema.parse(snapshot.document)
      revision = snapshot.revision
      result.plan = {
        text: derivePlanMinutes(result.planDocument),
        draft: live,
        source: live
          ? '当前材料（未归档）'
          : `归档 ${planRecord!.sourceCommit.slice(0, 12)} · ${planRecord!.committedAt}`
      }
    }
  } catch (error) {
    result.planError = message(error)
  }
  try {
    const snapshot = live
      ? input.acceptanceWorktreeId
        ? await nativeVersionMaterialPort(
            { ...scope, worktreeId: input.acceptanceWorktreeId, workflow: 'acceptance' },
            owner
          ).read(version)
        : null
      : acceptanceRecord
        ? await port.read({
            scope,
            sourceCommit: acceptanceRecord.sourceCommit,
            version,
            cycleId: acceptanceRecord.cycleId,
            workflow: acceptanceRecord.workflow
          })
        : null
    if (snapshot) {
      const document = AcceptanceMaterialSchema.parse(snapshot.document)
      if (live && revision && document.planRef.revision !== revision) {
        result.acceptanceError = '现有验收对应较早计划，本轮尚无对应验收'
      } else {
        const adopted = await port.readPlan({ scope, planRef: document.planRef })
        const plan = PlanningMaterialSchema.parse(adopted.document)
        if (
          adopted.revision !== document.planRef.revision ||
          plan.version !== version ||
          plan.cycleId !== document.planRef.cycleId
        ) {
          throw new Error('验收引用的计划身份或修订不一致')
        }
        result.planDocument = plan
        result.planError = null
        result.plan = {
          text: derivePlanMinutes(plan),
          draft: adopted.source.kind === 'draft',
          source:
            adopted.source.kind === 'committed'
              ? `验收所用计划 · ${adopted.source.sourceCommit.slice(0, 12)}`
              : '验收所用计划（草稿）'
        }
        result.acceptance = {
          document,
          draft: live,
          source: live
            ? '当前材料（未归档）'
            : `归档 ${acceptanceRecord!.sourceCommit.slice(0, 12)} · ${acceptanceRecord!.committedAt}`
        }
      }
    }
  } catch (error) {
    result.acceptanceError = message(error)
    // An unrelated latest plan cannot stand beside an acceptance whose reference failed.
    if (acceptanceRecord) {
      result.plan = null
      result.planDocument = null
      result.planError = '无法核对验收所用计划'
    }
  }
  result.loading = false
  return result
}
export function useVersionMinutes(input: MinutesInput, retry = 0): VersionMinutes | null {
  const {
    baseScope,
    baseWorktreeId,
    planWorktreeId,
    acceptanceWorktreeId,
    history,
    currentVersion,
    version,
    cycle
  } = input
  const [state, setState] = useState<{ key: string; minutes: VersionMinutes | null } | null>(null)
  const key = JSON.stringify([
    baseScope,
    baseWorktreeId,
    planWorktreeId,
    acceptanceWorktreeId,
    currentVersion,
    version,
    cycle,
    history,
    retry
  ])
  useEffect(() => {
    let cancelled = false
    void readVersionMinutes({
      baseScope,
      baseWorktreeId,
      planWorktreeId,
      acceptanceWorktreeId,
      history,
      currentVersion,
      version,
      cycle
    }).then((minutes) => {
      if (!cancelled) {
        setState({ key, minutes })
      }
    })
    return () => {
      cancelled = true
    }
  }, [
    key,
    baseScope,
    baseWorktreeId,
    planWorktreeId,
    acceptanceWorktreeId,
    history,
    currentVersion,
    version,
    cycle
  ])
  return state?.key === key ? state.minutes : version ? emptyMinutes(version, cycle) : null
}
