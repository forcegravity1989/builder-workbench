import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'
import type { VersionCatalogState } from '../use-version-catalog'
import { readWorkflowEvidence, workflowReferences } from './read-workflow-evidence'
import type { WorkflowEvidence } from './workflow-evidence'
import { nativeTaskReferenceReader } from '../native-task-port'
import { useAppStore } from '@/store'
import { taskKey } from './feature-model'
import { createOverviewReadCache } from './overview-read-cache'

const cache = createOverviewReadCache<WorkflowEvidence>((value, previous) => {
  const invalidReports = new Map(
    value.tasks.filter((task) => task.reportProblem).map((task) => [taskKey(task.reference), task])
  )
  return value.problems.length && previous
    ? {
        ...previous,
        tasks: previous.tasks.map((task) => invalidReports.get(taskKey(task.reference)) ?? task),
        problems: value.problems,
        stale: true
      }
    : value
}, true)

/** Mounted only while AI statistics are enabled; basic refresh stays independent. */
export function useWorkflowEvidence(
  catalog: VersionCatalogState,
  plan: PlanningMaterial | null,
  version: string,
  revision?: string
) {
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
  const firstRead = useRef(true)
  const subscribe = useCallback(
    (listener: () => void) => cache.subscribe(scopeKey, listener),
    [scopeKey]
  )
  const state = useSyncExternalStore(subscribe, () => cache.get(scopeKey))
  useEffect(() => {
    if (!plan || !catalog.scope) {
      return
    }
    let cancelled = false
    const force = (firstRead.current && Boolean(cache.get(scopeKey).value)) || refreshToken > 0
    firstRead.current = false
    const running = cache.get(scopeKey).loading
    const load = (signal: AbortSignal) => readWorkflowEvidence(catalog, plan, force, signal)
    const request = cache.read(scopeKey, load, force)
    if (force && running) {
      void request.then(() => {
        if (!cancelled) {
          void cache.read(scopeKey, load, true)
        }
      })
    }
    return () => {
      cancelled = true
    }
    // Source identity, revision and explicit refresh control reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, refreshToken])
  return {
    value: state.value,
    error: state.error,
    loading: Boolean(plan) && (state.loading || (!state.value && !state.error)),
    refresh: () => setRefreshToken((token) => token + 1)
  }
}
