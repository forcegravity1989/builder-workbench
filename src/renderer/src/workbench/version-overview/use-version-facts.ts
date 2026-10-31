import type { VersionCatalogState } from '../use-version-catalog'
import { useVersionOverviewMaterials } from '../version-overview-materials'
import { useOverviewFeatures } from './use-overview-features'

/** Compose pinned materials, historical cutoffs and source-scoped feature reads. */
export function useVersionFacts(
  catalog: VersionCatalogState,
  version: string,
  refreshToken: number
) {
  const materials = useVersionOverviewMaterials({ catalog, version, refreshToken })
  const { plan, acceptance } = materials
  const historical = acceptance.kind === 'ready' && acceptance.source === 'committed'
  const features = useOverviewFeatures({
    catalog,
    plan: plan.kind === 'ready' ? plan.document : null,
    planSource: plan.kind === 'ready' ? plan.source : 'committed',
    version,
    before: historical ? acceptance.acceptedAt : undefined,
    historical,
    refreshToken
  })
  return { materials, features }
}
