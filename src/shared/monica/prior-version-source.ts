import { compareMaterialVersions } from './version-catalog'
import type { VersionHistoryCatalog } from './version-history'
import { MaterialVersion, type PlanningProgressSource } from './version-material'

export type PriorVersionSource =
  | { kind: 'none' }
  | { kind: 'missing'; version: string }
  | { kind: 'source'; source: PlanningProgressSource }

/** Choose the adjacent version before looking for acceptance; never skip an unfinished version. */
export function selectPriorVersionSource(
  version: string,
  catalog: VersionHistoryCatalog,
  knownVersions: readonly string[] = []
): PriorVersionSource {
  const versions = new Set([
    ...knownVersions,
    ...catalog.records.map((record) => record.version),
    ...catalog.problems.map((problem) => problem.version)
  ])
  const previous = [...versions]
    .filter((candidate) => MaterialVersion.safeParse(candidate).success)
    .filter((candidate) => compareMaterialVersions(candidate, version) < 0)
    .sort(compareMaterialVersions)
    .at(-1)
  if (!previous) {
    return { kind: 'none' }
  }
  const acceptance = catalog.records.find(
    (record) => record.version === previous && record.workflow === 'acceptance'
  )
  if (!acceptance) {
    const problem = catalog.problems.find((item) => item.version === previous)
    if (problem) {
      throw new Error(problem.message)
    }
    return { kind: 'missing', version: previous }
  }
  return {
    kind: 'source',
    source: {
      version: acceptance.version,
      cycleId: acceptance.cycleId,
      sourceCommit: acceptance.sourceCommit,
      revision: acceptance.revision
    }
  }
}
