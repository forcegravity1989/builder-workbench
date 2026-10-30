import { useEffect, useRef, useState } from 'react'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'
import type { VersionCatalogState } from '../use-version-catalog'
import { readWorkflowEvidence, workflowReferences } from './read-workflow-evidence'
import type { WorkflowEvidence } from './workflow-evidence'
import { nativeTaskReferenceReader } from '../native-task-port'
import { useAppStore } from '@/store'
import { taskKey } from './feature-model'

const cache = new Map<string, WorkflowEvidence>()
const requests = new Map<string, Promise<WorkflowEvidence>>()
const generations = new Map<string, number>()

function load(key: string, catalog: VersionCatalogState, plan: PlanningMaterial, force: boolean) {
  if (!force && requests.has(key)) {
    return requests.get(key)!
  }
  if (!force && cache.has(key)) {
    return Promise.resolve(cache.get(key)!)
  }
  const generation = (generations.get(key) ?? 0) + 1
  generations.set(key, generation)
  const previous = cache.get(key)
  const request = readWorkflowEvidence(catalog, plan, force)
    .then((value) => {
      const invalidReports = new Map(
        value.tasks
          .filter((task) => task.reportProblem)
          .map((task) => [taskKey(task.reference), task])
      )
      const next =
        value.problems.length && previous
          ? {
              ...previous,
              tasks: previous.tasks.map(
                (task) => invalidReports.get(taskKey(task.reference)) ?? task
              ),
              problems: value.problems,
              stale: true
            }
          : value
      if (generations.get(key) === generation) {
        cache.set(key, next)
      }
      return next
    })
    .finally(() => {
      if (generations.get(key) === generation) {
        requests.delete(key)
      }
    })
  requests.set(key, request)
  return request
}

/** Basic-data refresh does not reset this independent report read. */
export function useWorkflowEvidence(
  catalog: VersionCatalogState,
  plan: PlanningMaterial | null,
  version: string,
  revision?: string,
  sourceReady = true
) {
  // Source registrations may move independently of the page's own project.
  useAppStore((state) => state.repos)
  const referenceSourceKey =
    plan && catalog.scope
      ? nativeTaskReferenceReader.key(catalog.scope, workflowReferences(plan))
      : null
  const scopeKey = JSON.stringify([
    referenceSourceKey,
    catalog.scope,
    catalog.home?.id,
    version,
    revision,
    plan ? workflowReferences(plan) : null
  ])
  const [refreshToken, setRefreshToken] = useState(0)
  const forceKey = useRef<string | null>(null)
  const key = JSON.stringify([scopeKey, refreshToken])
  const [state, setState] = useState<{
    key: string
    scopeKey: string
    value?: WorkflowEvidence
    error?: string
    loading: boolean
  }>({ key: '', scopeKey: '', loading: false })
  useEffect(() => {
    let cancelled = false
    if (!plan || !catalog.scope || !sourceReady) {
      return () => {
        cancelled = true
      }
    }
    const force = forceKey.current === key
    if (force) {
      forceKey.current = null
    }
    void load(scopeKey, catalog, plan, force)
      .then((value) => {
        if (!cancelled) {
          setState({ key, scopeKey, value, loading: false })
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setState({
            key,
            scopeKey,
            value: cache.get(scopeKey),
            error: reason instanceof Error ? reason.message : String(reason),
            loading: false
          })
        }
      })
    return () => {
      cancelled = true
    }
    // Scope identity and revision, not unrelated store renders, control reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, sourceReady])
  const current =
    state.scopeKey === scopeKey ? (state.value ?? cache.get(scopeKey)) : cache.get(scopeKey)
  return {
    value: current,
    error: state.key === key ? state.error : undefined,
    loading: Boolean(plan) && state.key !== key,
    refresh: () => {
      const token = refreshToken + 1
      forceKey.current = JSON.stringify([scopeKey, token])
      setRefreshToken(token)
    }
  }
}
