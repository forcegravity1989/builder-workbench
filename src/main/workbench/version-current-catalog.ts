import type { MetricScope } from '../../shared/workbench/metrics'
import { MaterialVersion } from '../../shared/workbench/version-material'
import type {
  VersionHistoryCatalog,
  VersionHistoryPort,
  VersionHistoryProblem,
  VersionHistorySource,
  VersionTreePlanCatalog
} from '../../shared/workbench/version-history'
import { HistorySourceError } from './version-history-snapshot'

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
    const path = /^\.bw\/planning\/([^/]+)\/(data|acceptance)\.json$/.exec(file)
    if (!path) {
      continue
    }
    const workflow = path[2] === 'data' ? 'plan' : 'acceptance'
    const source = { version: path[1], sourceCommit: commit, workflow, committedAt } as const
    if (!MaterialVersion.safeParse(path[1]).success) {
      problems.push({
        ...source,
        code: 'invalid-version',
        message: `版本目录 ${path[1]} 不符合材料约定`
      })
      continue
    }
    try {
      const snapshot = await read(scope, commit, path[1], workflow)
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
