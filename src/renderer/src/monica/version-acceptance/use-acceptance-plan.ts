import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  VersionHistoryPlan,
  VersionHistoryPort,
  VersionTreePlan
} from '../../../../shared/monica/version-history'
import type { MetricScope } from '../../../../shared/monica/metrics'
import type { PlanReference } from './acceptance-model'
import { assertFixedPlan } from './acceptance-model'
import type { nativeVersionMaterialPort } from '../version-material-port'
import { historyErrorCode } from '../version-history-port'

export function useAcceptanceSources(
  history: VersionHistoryPort,
  material: ReturnType<typeof nativeVersionMaterialPort>,
  scope: MetricScope,
  materialRefresh = 0
) {
  const [loadedRefresh, setLoadedRefresh] = useState(-1)
  const [sources, setSources] = useState<VersionTreePlan[]>([])
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
      setSources(catalog.plans)
      setLoadedRefresh(materialRefresh)
      setError(materials.find((item) => item.state !== 'ready')?.error ?? null)
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
    error,
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
    | { key: string; kind: 'mismatch' | 'unavailable' | 'missing'; reason: string }
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
          // A missing file is an empty showcase, not an error; the user sees it
          // after the plan is merged and the screen is refreshed.
          const missing = historyErrorCode(reason) === 'history-unavailable'
          setResult({
            key,
            kind: missing ? 'missing' : sourceRead ? 'mismatch' : 'unavailable',
            reason: String(reason)
          })
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
    error:
      current && (current.kind === 'mismatch' || current.kind === 'unavailable')
        ? current.reason
        : null
  }
}
