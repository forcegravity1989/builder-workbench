import { useEffect, useRef, useState } from 'react'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'
import type { VersionCatalogState } from '../use-version-catalog'
import type { FeatureData } from './feature-model'
import { readOverviewFeatures, type OverviewFeatureArgs } from './read-overview-features'
import { nativeTaskReferenceReader } from '../native-task-port'
import { useAppStore } from '@/store'
import { normalizeStoredWorkbenchVersionBinding } from '../../../../shared/workbench/version-binding'
import { taskKey } from './feature-model'

type FeatureRead = { features: FeatureData[]; problems: string[]; readAt?: string; stale?: boolean }
const cache = new Map<string, FeatureRead>()
const requests = new Map<string, Promise<FeatureRead>>()
const generations = new Map<string, number>()

function read(key: string, args: OverviewFeatureArgs, force: boolean): Promise<FeatureRead> {
  if (!force && requests.has(key)) {
    return requests.get(key)!
  }
  if (!force && cache.has(key)) {
    return Promise.resolve(cache.get(key)!)
  }
  const generation = (generations.get(key) ?? 0) + 1
  generations.set(key, generation)
  const previous = cache.get(key)
  const promise = readOverviewFeatures(args, force)
    .then((result) => {
      const failures = [
        ...result.problems,
        ...result.features.flatMap((feature) =>
          feature.problems.map((problem) => `#${feature.root.iid}：${problem}`)
        )
      ]
      const value: FeatureRead =
        failures.length && previous
          ? { ...previous, problems: failures, stale: true }
          : { ...result, problems: failures, readAt: new Date().toISOString() }
      if (generations.get(key) === generation) {
        cache.set(key, value)
      }
      return value
    })
    .catch((reason) => {
      if (previous) {
        return {
          ...previous,
          problems: [reason instanceof Error ? reason.message : String(reason)],
          stale: true
        }
      }
      throw reason
    })
    .finally(() => {
      if (generations.get(key) === generation) {
        requests.delete(key)
      }
    })
  requests.set(key, promise)
  return promise
}

export function useOverviewFeatures(args: {
  catalog: VersionCatalogState
  plan: PlanningMaterial | null
  planSource: 'committed' | 'draft'
  version: string
  before?: string
  historical: boolean
  refreshToken: number
}) {
  const { catalog, plan, planSource, version, before, historical, refreshToken } = args
  useAppStore((state) => state.repos)
  const references = [
    ...(plan?.tasks ?? []),
    ...(catalog.catalog?.entries.flatMap((entry) => entry.tasks) ?? [])
  ].sort((a, b) => taskKey(a).localeCompare(taskKey(b)))
  const referenceSourceKey = catalog.scope
    ? nativeTaskReferenceReader.key(catalog.scope, references)
    : null
  const contextKey = JSON.stringify([
    referenceSourceKey,
    catalog.scope,
    catalog.home?.id,
    plan?.tasks,
    planSource,
    catalog.catalog?.entries
      .map((entry) => [entry.version, entry.tasks, entry.goals, entry.material, entry.draft])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    version,
    before,
    historical,
    catalog.worktrees
      .filter((tree) => {
        const binding = normalizeStoredWorkbenchVersionBinding(tree.workbenchVersionBinding)
        return (
          binding?.workflow === 'issue' &&
          (binding.version === version ||
            catalog.catalog?.entries.some((entry) => entry.version === binding.version))
        )
      })
      .map((tree) => [
        tree.id,
        tree.repoId,
        tree.hostId,
        tree.runtimeOwnerEnvironmentId,
        tree.linkedPR,
        tree.linkedWorkItem,
        tree.workbenchVersionBinding,
        tree.isArchived
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  ])
  const key = JSON.stringify([contextKey, refreshToken])
  const lastRefresh = useRef(refreshToken)
  const [state, setState] = useState<FeatureRead & { key: string; loading: boolean }>({
    key: '',
    features: [],
    problems: [],
    loading: true
  })
  useEffect(() => {
    let cancelled = false
    if (!plan || !catalog.scope) {
      return () => {
        cancelled = true
      }
    }
    const force = lastRefresh.current !== refreshToken
    lastRefresh.current = refreshToken
    void read(contextKey, { catalog, plan, planSource, version, before, historical }, force)
      .then((value) => {
        if (!cancelled) {
          setState({ ...value, key, loading: false })
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setState({
            key,
            features: [],
            problems: [reason instanceof Error ? reason.message : String(reason)],
            loading: false
          })
        }
      })
    return () => {
      cancelled = true
    }
    // The key covers source ownership and material revisions, not unrelated renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state.key === key
    ? state
    : { ...(cache.get(contextKey) ?? { features: [], problems: [] }), loading: Boolean(plan) }
}
