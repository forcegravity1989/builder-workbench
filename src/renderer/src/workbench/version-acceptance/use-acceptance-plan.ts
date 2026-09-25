import { useEffect, useState } from 'react'
import type {
  VersionHistoryPlan,
  VersionHistoryPort,
  VersionHistoryProblem,
  VersionHistorySource
} from '../../../../shared/workbench/version-history'
import type { MetricScope } from '../../../../shared/workbench/metrics'
import type { EvidenceCheck, PlanReference } from './acceptance-model'
import { assertFixedPlan } from './acceptance-model'
import type { nativeVersionMaterialPort } from '../version-material-port'

export function useAcceptanceSources(
  history: VersionHistoryPort,
  material: ReturnType<typeof nativeVersionMaterialPort>,
  scope: MetricScope
) {
  const [sources, setSources] = useState<VersionHistorySource[]>([])
  const [versions, setVersions] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [problems, setProblems] = useState<VersionHistoryProblem[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => {
    let current = true
    void Promise.all([material.list(), history.list({ scope })])
      .then(([materials, catalog]) => {
        if (!current) {
          return
        }
        const records = catalog.records
        setSources(records.filter((item) => item.workflow === 'plan'))
        setProblems(catalog.problems)
        setVersions(
          [
            ...new Set([
              ...materials.map((item) => item.version),
              ...records.filter((item) => item.workflow === 'plan').map((item) => item.version)
            ])
          ].sort()
        )
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
  }, [history, material, scope, refreshKey])
  return { sources, versions, error, problems, refresh: () => setRefreshKey((value) => value + 1) }
}

export function useFixedAcceptancePlan(
  history: VersionHistoryPort,
  scope: MetricScope,
  reference: PlanReference | undefined
) {
  const key = reference ? JSON.stringify(reference) : ''
  const [result, setResult] = useState<{
    key: string
    plan: VersionHistoryPlan
    checkedAt: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!reference) {
      return
    }
    let current = true
    void history
      .readPlan({ scope, planRef: reference })
      .then((plan) => {
        assertFixedPlan(reference, plan)
        if (current) {
          setResult({ key, plan, checkedAt: new Date().toISOString() })
          setError(null)
        }
      })
      .catch((reason) => {
        if (current) {
          setResult(null)
          setError(String(reason))
        }
      })
    return () => {
      current = false
    }
  }, [history, scope, reference, key])
  const verified = result?.key === key ? result : null
  const verification: EvidenceCheck = verified
    ? { kind: 'verified', checkedAt: verified.checkedAt }
    : { kind: 'unknown', reason: error ?? '固定计划尚未读取' }
  return { plan: verified?.plan ?? null, verification, error }
}
