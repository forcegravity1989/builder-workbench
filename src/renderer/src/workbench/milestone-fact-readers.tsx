import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MilestoneDraft, ScheduledVersion } from '../../../shared/workbench/project-milestones'
import { datedMilestoneVersions } from '../../../shared/workbench/milestone-calendar'
import type { VersionCatalogState } from './use-version-catalog'
import { useVersionFacts } from './version-overview/use-version-facts'
import { milestoneVersionKey, type MilestoneVersionFacts } from './milestone-feature-facts'
import type { FeatureData } from './version-overview/feature-model'

const emptyFeatures: FeatureData[] = []

function VersionReader({
  catalog,
  version,
  refreshToken,
  receive
}: {
  catalog: VersionCatalogState
  version: ScheduledVersion
  refreshToken: number
  receive(key: string, facts: MilestoneVersionFacts): void
}) {
  const { materials, features } = useVersionFacts(catalog, version.version, refreshToken)
  const plan = materials.plan.kind === 'ready' ? materials.plan.document : null
  const materialFailed = Boolean(
    materials.problems?.length ||
    materials.plan.kind === 'error' ||
    materials.acceptance.kind === 'error'
  )
  const failed = materialFailed || features.problems.length > 0
  const loading = Boolean(materials.refreshing || features.loading)
  const stale =
    (!materialFailed || materials.stale === true) &&
    (!features.problems.length || features.stale === true) &&
    failed
  const readAt = [materials.readAt, features.readAt]
    .filter((at): at is string => Boolean(at))
    .sort()[0]
  const items = features.features.length ? features.features : emptyFeatures
  const value = useMemo(
    () => ({ plan, features: items, failed, loading, stale, readAt }),
    [plan, items, failed, loading, stale, readAt]
  )
  const key = milestoneVersionKey(version)
  useEffect(() => receive(key, value), [key, value, receive])
  return null
}

/** Readers subscribe to the version screen's caches; this state only collects their view results. */
export function useMilestoneFactReaders(
  catalog: VersionCatalogState,
  draft: MilestoneDraft,
  started: Set<string>
) {
  const versions = datedMilestoneVersions(draft).filter(
    (version) =>
      started.has(version.cycleId) &&
      draft.material.features.some((feature) =>
        feature.deliveries.some(
          (delivery) => delivery.version.cycleId === version.cycleId && delivery.stages.length
        )
      )
  )
  const context = JSON.stringify([catalog.scope, catalog.home?.id])
  const current = useRef(context)
  current.current = context
  const [snapshot, setSnapshot] = useState<{
    context: string
    values: Record<string, MilestoneVersionFacts>
  }>({ context, values: {} })
  const [refreshToken, setRefreshToken] = useState(0)
  const receive = useCallback(
    (key: string, value: MilestoneVersionFacts) => {
      if (current.current !== context) {
        return
      }
      setSnapshot((previous) => {
        if (previous.context === context && previous.values[key] === value) {
          return previous
        }
        return {
          context,
          values: { ...(previous.context === context ? previous.values : {}), [key]: value }
        }
      })
    },
    [context]
  )
  const values = snapshot.context === context ? snapshot.values : {}
  const reads = versions.map((version) => values[milestoneVersionKey(version)])
  return {
    values,
    loading: reads.some((read) => !read || read.loading),
    failed: reads.some((read) => read?.failed),
    readAt: reads
      .filter((read) => read && (!read.failed || read.stale))
      .map((read) => read?.readAt)
      .filter((at): at is string => Boolean(at))
      .sort()[0],
    refresh() {
      setRefreshToken((n) => n + 1)
      catalog.reload()
    },
    readers: versions.map((version) => (
      <VersionReader
        key={`${context}:${milestoneVersionKey(version)}`}
        catalog={catalog}
        version={version}
        refreshToken={refreshToken}
        receive={receive}
      />
    ))
  }
}
