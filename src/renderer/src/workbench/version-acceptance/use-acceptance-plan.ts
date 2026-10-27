import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  VersionHistoryPlan,
  VersionHistoryPort,
  VersionTreePlan
} from '../../../../shared/workbench/version-history'
import type { MetricScope } from '../../../../shared/workbench/metrics'
import type { PlanReference } from './acceptance-model'
import { assertFixedPlan } from './acceptance-model'
import type { nativeVersionMaterialPort } from '../version-material-port'
import { MaterialVersion } from '../../../../shared/workbench/version-material'
import type { CycleMaterialProblem } from '../version-cycle/cycle-start-request'
import { compareMaterialVersions } from '../../../../shared/workbench/version-catalog'

/**
 * Names for the acceptance version menu: local acceptance files, plus version
 * folders committed on the cycle branch itself (its HEAD tree, kept current by
 * the trunk sync on screen entry). One folder with data.json is one version;
 * provider merges are signals, never the source of the candidate list.
 */
export function acceptanceVersionChoices(input: {
  materials: readonly { version: string }[]
  treePlans: readonly Pick<VersionTreePlan, 'version'>[]
  problems?: readonly TreePlanProblem[]
}): string[] {
  return [
    ...new Set([
      ...input.materials.map((item) => item.version),
      ...input.treePlans.map((item) => item.version),
      ...(input.problems ?? [])
        .filter((item) => MaterialVersion.safeParse(item.version).success)
        .map((item) => item.version)
    ])
  ].sort(compareMaterialVersions)
}

type TreePlanProblem = { version: string; code: string; message: string }

export function useAcceptanceSources(
  history: VersionHistoryPort,
  material: ReturnType<typeof nativeVersionMaterialPort>,
  scope: MetricScope,
  materialRefresh = 0
) {
  const [loadedRefresh, setLoadedRefresh] = useState(-1)
  const [sources, setSources] = useState<VersionTreePlan[]>([])
  const [versions, setVersions] = useState<string[]>([])
  const [materialProblems, setMaterialProblems] = useState<CycleMaterialProblem[]>([])
  const [error, setError] = useState<string | null>(null)
  const sequence = useRef(0)
  const refresh = useCallback(async () => {
    const token = ++sequence.current
    try {
      const [materials, catalog] = await Promise.all([
        material.list(),
        history.listTreePlans({ scope })
      ])
      if (token !== sequence.current) {
        return
      }
      setMaterialProblems([
        ...materials.filter((item) => item.state !== 'ready'),
        ...catalog.problems
          .filter((item) => MaterialVersion.safeParse(item.version).success)
          .map((item): CycleMaterialProblem => ({
            version: item.version,
            workflow: 'plan',
            state: item.code === 'migration-required' ? 'migration-required' : 'invalid',
            error: item.message
          }))
      ])
      setSources(catalog.plans)
      setLoadedRefresh(materialRefresh)
      setVersions(
        acceptanceVersionChoices({
          materials,
          treePlans: catalog.plans,
          problems: catalog.problems
        })
      )
      setError(null)
    } catch (reason) {
      if (token === sequence.current) {
        setError(String(reason))
      }
    }
  }, [history, material, scope, materialRefresh])
  useEffect(() => {
    const requests = sequence
    void refresh()
    return () => {
      requests.current++
    }
  }, [refresh, materialRefresh])
  return {
    sources,
    loadedRefresh,
    versions,
    error,
    materialProblems,
    refresh
  }
}

export function useFixedAcceptancePlan(
  history: VersionHistoryPort,
  scope: MetricScope,
  reference: PlanReference | undefined
) {
  const [refresh, setRefresh] = useState(0)
  const key = reference ? JSON.stringify(reference) : ''
  // Keyed on the serialized identity, not the object: a save round-trips the
  // material through the schema and hands back a fresh planRef object, which
  // would re-read the fixed plan on every autosave.
  const referenceRef = useRef(reference)
  referenceRef.current = reference
  const [result, setResult] = useState<
    | { key: string; kind: 'verified'; plan: VersionHistoryPlan; checkedAt: string }
    | { key: string; kind: 'mismatch' | 'unavailable'; reason: string }
    | null
  >(null)
  useEffect(() => {
    const planRef = referenceRef.current
    if (!planRef) {
      return
    }
    let current = true
    let sourceRead = false
    void history
      .readPlan({ scope, planRef })
      .then((plan) => {
        sourceRead = true
        assertFixedPlan(planRef, plan)
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
  }, [history, scope, key, refresh])
  const current = result?.key === key ? result : null
  return {
    refresh: () => setRefresh((value) => value + 1),
    plan: current?.kind === 'verified' ? current.plan : null,
    error: current && current.kind !== 'verified' ? current.reason : null
  }
}
