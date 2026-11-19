import type { MetricScope } from '../../shared/monica/metrics'
import { MaterialVersion } from '../../shared/monica/version-material'
import type {
  VersionHistoryCatalog,
  VersionHistoryPort,
  VersionHistoryProblem,
  VersionHistorySource,
  VersionTreePlanCatalog
} from '../../shared/monica/version-history'
import { HistorySourceError } from './version-history-snapshot'
import { versionMaterialAtGitPath } from './version-history-log'

export async function withVersionTreeAlignment(
  scope: MetricScope,
  adoptedCommit: string | undefined,
  tree: VersionTreePlanCatalog,
  git: (scope: MetricScope, args: string[]) => Promise<Buffer>
): Promise<VersionTreePlanCatalog> {
  if (!adoptedCommit) {
    return tree
  }
  try {
    await git(scope, ['merge-base', '--is-ancestor', adoptedCommit, tree.head])
    return { ...tree, alignment: 'aligned' }
  } catch {
    return { ...tree, alignment: 'unverified' }
  }
}

/** A version menu reflects files in the trunk baseline tree, never deleted or superseded Git snapshots. */
export async function readCurrentVersionCatalog(
  scope: MetricScope,
  baseline: { ref: string; commit: string },
  git: (scope: MetricScope, args: string[]) => Promise<Buffer>,
  read: (
    scope: MetricScope,
    commit: string,
    version: string,
    workflow: 'plan' | 'acceptance'
  ) => Promise<Pick<Awaited<ReturnType<VersionHistoryPort['read']>>, 'document' | 'revision'>>
): Promise<VersionHistoryCatalog> {
  const commit = baseline.commit
  const files = await git(scope, [
    'ls-tree',
    '-r',
    '-z',
    '--name-only',
    commit,
    '--',
    '.bw/planning'
  ])
  const committedAt = (await git(scope, ['show', '-s', '--format=%cI', commit]))
    .toString('utf8')
    .trim()
  const records: VersionHistorySource[] = []
  const problems: VersionHistoryProblem[] = []
  for (const file of files.toString('utf8').split('\0')) {
    const material = versionMaterialAtGitPath(file)
    if (!material) {
      continue
    }
    const { version, workflow } = material
    const source = { version, sourceCommit: commit, workflow, committedAt }
    if (!MaterialVersion.safeParse(version).success) {
      problems.push({
        ...source,
        code: 'invalid-version',
        message: `版本目录 ${version} 不符合材料约定`
      })
      continue
    }
    try {
      const snapshot = await read(scope, commit, version, workflow)
      records.push({ ...source, cycleId: snapshot.document.cycleId, revision: snapshot.revision })
    } catch (error) {
      problems.push({
        ...source,
        code: error instanceof HistorySourceError ? error.code : 'history-unavailable',
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }
  return { records, problems, baselineCommit: commit, baselineRef: baseline.ref }
}
