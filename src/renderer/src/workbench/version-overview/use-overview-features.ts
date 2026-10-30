import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'
import type { VersionCatalogState } from '../use-version-catalog'
import type { FeatureData } from './feature-model'
import { readOverviewFeatures } from './read-overview-features'
import { nativeTaskReferenceReader } from '../native-task-port'
import { useAppStore } from '@/store'
import { normalizeStoredWorkbenchVersionBinding } from '../../../../shared/workbench/version-binding'
import { taskKey, PARSER_REVISION } from './feature-model'
import { createOverviewReadCache } from './overview-read-cache'

type FeatureRead = { features: FeatureData[]; problems: string[]; readAt?: string; stale?: boolean }
export const featureFactsCache = createOverviewReadCache<FeatureRead>((result, previous) => {
  const failures = [
    ...result.problems,
    ...result.features.flatMap((feature) =>
      feature.problems.map((p) => `#${feature.root.iid}：${p}`)
    )
  ]
  return failures.length && previous
    ? { ...previous, problems: failures, stale: true }
    : { ...result, problems: failures, readAt: new Date().toISOString() }
})

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
    PARSER_REVISION,
    referenceSourceKey,
    catalog.scope,
    catalog.home?.id,
    plan,
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
  const state = useSyncExternalStore(
    (listener) => featureFactsCache.subscribe(contextKey, listener),
    () => featureFactsCache.get(contextKey)
  )
  useEffect(() => {
    if (!plan || !catalog.scope) {
      return
    }
    const force = lastRefresh.current !== refreshToken
    lastRefresh.current = refreshToken
    void featureFactsCache.read(
      contextKey,
      () => readOverviewFeatures({ catalog, plan, planSource, version, before, historical }, force),
      force
    )
    // The key covers owner routing and source revisions, not unrelated catalog discovery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return {
    ...(state.value ?? { features: [], problems: [] }),
    problems: [...(state.value?.problems ?? []), ...(state.error ? [state.error] : [])],
    stale: state.value?.stale || Boolean(state.error && state.value),
    loading: Boolean(plan) && (state.loading || (!state.value && !state.error))
  }
}
