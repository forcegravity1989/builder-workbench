import { useEffect, useState } from 'react'
import type { NativeWorkspaceScope } from './version-cycle/native-workspace'
import { nativeVersionHistoryPort } from './version-history-port'
import { nativeVersionMaterialPort } from './version-material-port'
import type {
  VersionHistoryCatalog,
  VersionHistoryPort
} from '../../../shared/workbench/version-history'
import {
  AcceptanceMaterialSchema,
  PlanningMaterialSchema,
  type AcceptanceMaterial,
  type PlanningMaterial
} from '../../../shared/workbench/version-material'
import { derivePlanMinutes } from './version-planning/plan-summary'

export type VersionMinutes = {
  version: string
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
function emptyMinutes(version: string): VersionMinutes {
  return {
    version,
    loading: true,
    plan: null,
    acceptance: null,
    planDocument: null,
    planError: null,
    acceptanceError: null
  }
}
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const committedReads = new Map<string, Promise<Awaited<ReturnType<VersionHistoryPort['read']>>>>()
const committedPlans = new Map<
  string,
  Promise<Awaited<ReturnType<VersionHistoryPort['readPlan']>>>
>()
function readReferencedPlan(
  port: VersionHistoryPort,
  request: Parameters<VersionHistoryPort['readPlan']>[0],
  owner?: string
) {
  if (request.planRef.kind === 'draft') {
    return port.readPlan(request)
  }
  const key = JSON.stringify([owner, request])
  let pending = committedPlans.get(key)
  if (!pending) {
    pending = port.readPlan(request).catch((error) => {
      committedPlans.delete(key)
      throw error
    })
    committedPlans.set(key, pending)
    if (committedPlans.size > 128) {
      committedPlans.delete(committedPlans.keys().next().value!)
    }
  }
  return pending
}
function readCommitted(
  port: VersionHistoryPort,
  request: Parameters<VersionHistoryPort['read']>[0],
  owner?: string
) {
  const key = JSON.stringify([owner, request])
  let pending = committedReads.get(key)
  if (!pending) {
    pending = port.read(request).catch((error) => {
      committedReads.delete(key)
      throw error
    })
    committedReads.set(key, pending)
    if (committedReads.size > 128) {
      committedReads.delete(committedReads.keys().next().value!)
    }
  }
  return pending
}
export async function readVersionMinutes(input: MinutesInput): Promise<VersionMinutes | null> {
  const { baseScope, baseWorktreeId, version, history } = input
  if (!baseScope || !baseWorktreeId || !version) {
    return null
  }
  const result = emptyMinutes(version)
  const owner = baseScope.runtimeOwnerEnvironmentId
  const scope = { repoId: baseScope.repoId, worktreeId: baseWorktreeId, hostId: baseScope.hostId }
  const port = nativeVersionHistoryPort(owner)
  const records = (history?.records ?? [])
    .filter((item) => item.version === version)
    .sort((a, b) => b.committedAt.localeCompare(a.committedAt))
  const planRecord = records.find((item) => item.workflow === 'plan')
  const acceptanceRecord = records.find((item) => item.workflow === 'acceptance')
  const live = version === input.currentVersion
  const load = async (workflow: 'plan' | 'acceptance') => {
    const worktreeId = workflow === 'plan' ? input.planWorktreeId : input.acceptanceWorktreeId
    if (live && worktreeId) {
      const draft = await nativeVersionMaterialPort({ ...scope, worktreeId, workflow }, owner).read(
        version
      )
      if (draft) {
        const record = workflow === 'plan' ? planRecord : acceptanceRecord
        return { ...draft, draft: draft.revision !== record?.revision }
      }
    }
    const record = workflow === 'plan' ? planRecord : acceptanceRecord
    if (record) {
      const snapshot = await readCommitted(
        port,
        { scope, sourceCommit: record.sourceCommit, version, cycleId: record.cycleId, workflow },
        owner
      )
      return { ...snapshot, draft: false }
    }
    const problem = history?.problems.find(
      (item) => item.version === version && item.workflow === workflow
    )
    if (problem) {
      throw new Error(problem.message)
    }
    return null
  }
  const [planResult, acceptanceResult] = await Promise.allSettled([
    load('plan'),
    load('acceptance')
  ])
  let revision: string | null = null
  try {
    if (planResult.status === 'rejected') {
      throw planResult.reason
    }
    const snapshot = planResult.value
    if (snapshot) {
      result.planDocument = PlanningMaterialSchema.parse(snapshot.document)
      revision = snapshot.revision
      result.plan = {
        text: derivePlanMinutes(result.planDocument),
        draft: snapshot.draft,
        source: snapshot.draft
          ? '当前材料（未归档）'
          : `采用版本 · ${planRecord!.sourceCommit.slice(0, 12)}`
      }
    }
  } catch (error) {
    result.planError = message(error)
  }
  try {
    if (acceptanceResult.status === 'rejected') {
      throw acceptanceResult.reason
    }
    const snapshot = acceptanceResult.value
    if (snapshot) {
      const document = AcceptanceMaterialSchema.parse(snapshot.document)
      if (revision && document.planRef.revision !== revision) {
        result.acceptanceError = '现有验收对应较早计划，本轮尚无对应验收'
      } else if (result.planError) {
        result.acceptanceError = '请先处理当前计划的数据问题'
      } else {
        const adopted = await readReferencedPlan(port, { scope, planRef: document.planRef }, owner)
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
          draft: snapshot.draft,
          source: snapshot.draft
            ? '当前材料（未归档）'
            : `采用版本 · ${acceptanceRecord!.sourceCommit.slice(0, 12)}`
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
    version
  } = input
  const [state, setState] = useState<{ key: string; minutes: VersionMinutes | null } | null>(null)
  const key = JSON.stringify([
    baseScope,
    baseWorktreeId,
    planWorktreeId,
    acceptanceWorktreeId,
    currentVersion,
    version,
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
      version
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
    version
  ])
  return state?.key === key ? state.minutes : version ? emptyMinutes(version) : null
}
