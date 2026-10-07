import { useEffect, useState } from 'react'
import type {
  VersionHistoryPlan,
  VersionHistoryPort,
  VersionTreePlan
} from '../../../../shared/workbench/version-history'
import type { MetricScope } from '../../../../shared/workbench/metrics'
import type { EvidenceCheck, PlanReference } from './acceptance-model'
import { assertFixedPlan } from './acceptance-model'
import type { nativeVersionMaterialPort } from '../version-material-port'
import type { VersionMaterialCandidate } from '../../../../shared/workbench/version-material-request'

/**
 * Names for the acceptance version menu: local acceptance files, plus version
 * folders committed on the cycle branch itself (its HEAD tree, kept current by
 * the trunk sync on screen entry). One folder with data.json is one version;
 * provider merges are signals, never the source of the candidate list.
 */
export function acceptanceVersionChoices(input: {
  materials: readonly { version: string }[]
  treePlans: readonly Pick<VersionTreePlan, 'version'>[]
}): string[] {
  return [
    ...new Set([
      ...input.materials.map((item) => item.version),
      ...input.treePlans.map((item) => item.version)
    ])
  ].sort()
}

export type TreePlanProblem = { version: string; code: string; message: string }

export function useAcceptanceSources(
  history: VersionHistoryPort,
  material: ReturnType<typeof nativeVersionMaterialPort>,
  scope: MetricScope,
  materialRefresh = 0
) {
  const [sources, setSources] = useState<VersionTreePlan[]>([])
  const [versions, setVersions] = useState<string[]>([])
  const [materialProblems, setMaterialProblems] = useState<VersionMaterialCandidate[]>([])
  const [error, setError] = useState<string | null>(null)
  const [problems, setProblems] = useState<TreePlanProblem[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => {
    let current = true
    void Promise.all([
      material.list().then((items) => {
        if (current) {
          setMaterialProblems(items.filter((item) => item.state !== 'ready'))
        }
        return items
      }),
      history.listTreePlans({ scope })
    ])
      .then(([materials, catalog]) => {
        if (!current) {
          return
        }
        setSources(catalog.plans)
        setProblems(catalog.problems)
        setVersions(acceptanceVersionChoices({ materials, treePlans: catalog.plans }))
        setError(null)
      })
      .catch((reason) => {
        if (current) {
          setError(String(reason))
        }
      })
    return () => {
      current = false
    }
  }, [history, material, scope, refreshKey, materialRefresh])
  return {
    sources,
    versions,
    error,
    problems,
    materialProblems,
    refresh: () => setRefreshKey((value) => value + 1)
  }
}

export function useFixedAcceptancePlan(
  history: VersionHistoryPort,
  scope: MetricScope,
  reference: PlanReference | undefined
) {
  const key = reference ? JSON.stringify(reference) : ''
  const [result, setResult] = useState<
    | { key: string; kind: 'verified'; plan: VersionHistoryPlan; checkedAt: string }
    | { key: string; kind: 'mismatch' | 'unavailable'; reason: string }
    | null
  >(null)
  useEffect(() => {
    if (!reference) {
      return
    }
    let current = true
    let sourceRead = false
    void history
      .readPlan({ scope, planRef: reference })
      .then((plan) => {
        sourceRead = true
        assertFixedPlan(reference, plan)
        if (current) {
          setResult({ key, kind: 'verified', plan, checkedAt: new Date().toISOString() })
        }
      })
      .catch((reason) => {
        if (current) {
          setResult({ key, kind: sourceRead ? 'mismatch' : 'unavailable', reason: String(reason) })
        }
      })
    return () => {
      current = false
    }
  }, [history, scope, reference, key])
  const current = result?.key === key ? result : null
  const verification: EvidenceCheck = current ?? { kind: 'unknown', reason: '固定计划尚未读取' }
  return {
    plan: current?.kind === 'verified' ? current.plan : null,
    verification,
    error: current && current.kind !== 'verified' ? current.reason : null
  }
}
