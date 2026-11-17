import { useMemo } from 'react'
import { useVersionMembership } from '../version-cycle/use-version-membership'
import type { VersionCatalogState } from '../use-version-catalog'
import { useVersionOverviewMaterials } from '../version-overview-materials'
import { useOverviewFeatures } from './use-overview-features'

/** Compose pinned materials, historical cutoffs and source-scoped feature reads. */
export function useVersionFacts(
  catalog: VersionCatalogState,
  version: string,
  refreshToken: number,
  sdlcEnabled?: boolean
) {
  const materials = useVersionOverviewMaterials({ catalog, version, refreshToken })
  const { plan, acceptance } = materials
  const historical = acceptance.kind === 'ready' && acceptance.source === 'committed'
  const planDocument = plan.kind === 'ready' ? plan.document : null
  const membership = useVersionMembership(catalog.scope, planDocument)
  const projectedPlan = useMemo(
    () =>
      planDocument && membership.references
        ? { ...planDocument, tasks: membership.references }
        : null,
    [planDocument, membership.references]
  )
  const features = useOverviewFeatures({
    catalog,
    plan: projectedPlan,
    planSource: plan.kind === 'ready' ? plan.source : 'committed',
    version,
    before: historical ? acceptance.acceptedAt : undefined,
    historical,
    refreshToken,
    enabled: sdlcEnabled
  })
  return { materials, features, membership, projectedPlan }
}
