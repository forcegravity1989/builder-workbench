import { useEffect, useRef, useState } from 'react'
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
import type { VersionMaterialCandidate } from '../../../../shared/workbench/version-material-request'

/**
 * Names for the acceptance version menu: local acceptance files, plus version
 * folders on the adopted baseline that contain data.json.
 */
export function acceptanceVersionChoices(input: {
  materials: readonly { version: string }[]
  treePlans: readonly Pick<VersionHistorySource, 'version'>[]
}): string[] {
  return [
    ...new Set([
      ...input.materials.map((item) => item.version),
      ...input.treePlans.map((item) => item.version)
    ])
  ].sort()
}

export function useAcceptanceSources(
  history: VersionHistoryPort,
  material: ReturnType<typeof nativeVersionMaterialPort>,
  scope: MetricScope
) {
  const [sources, setSources] = useState<VersionHistorySource[]>([])
  const [versions, setVersions] = useState<string[]>([])
  const [materialProblems, setMaterialProblems] = useState<VersionMaterialCandidate[]>([])
  const [error, setError] = useState<string | null>(null)
  const [problems, setProblems] = useState<VersionHistoryProblem[]>([])
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
      history.list({ scope })
    ])
      .then(([materials, catalog]) => {
        if (!current) {
          return
        }
        const treePlans = catalog.treePlans ?? []
        setSources(treePlans)
        setProblems(catalog.problems.filter((item) => item.code !== 'archive-unverified'))
        setVersions(acceptanceVersionChoices({ materials, treePlans }))
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
  return {
    sources,
    versions,
    error,
    problems,
    materialProblems,
    refresh: () => setRefreshKey((value) => value + 1)
  }
}

/** Opens the only plan folder on the adopted baseline so the acceptance sheet can show it. */
export function useOpenAcceptanceRound(input: {
  document: unknown
  busy: boolean
  contextVersion: string | null
  sources: readonly VersionHistorySource[]
  planChoice: string
  loadVersion(version: string): Promise<void>
  begin(): Promise<void>
}) {
  const openedKey = useRef<string | null>(null)
  const actions = useRef({ loadVersion: input.loadVersion, begin: input.begin })
  actions.current = { loadVersion: input.loadVersion, begin: input.begin }
  const { document, busy, contextVersion, sources, planChoice } = input
  useEffect(() => {
    if (document || busy) {
      return
    }
    if (!contextVersion) {
      const names = [...new Set(sources.map((item) => item.version))]
      if (names.length !== 1) {
        return
      }
      const key = `version:${names[0]}`
      if (openedKey.current === key) {
        return
      }
      openedKey.current = key
      void actions.current.loadVersion(names[0])
      return
    }
    if (!planChoice || openedKey.current === planChoice) {
      return
    }
    const source = sources.find(
      (item) => `${item.sourceCommit}:${item.version}:${item.cycleId}` === planChoice
    )
    if (!source || source.version !== contextVersion) {
      return
    }
    openedKey.current = planChoice
    void actions.current.begin()
  }, [document, busy, contextVersion, sources, planChoice])
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
