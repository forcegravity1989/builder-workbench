import type {
  VersionCatalogDraftSource,
  VersionCatalogEntry
} from '../../../shared/workbench/version-catalog'
import type { NativeWorkspaceScope } from './version-cycle/native-workspace'
import type { VersionCatalogPlanTree } from './version-catalog-load'

export type CatalogGoalSource =
  | { kind: 'draft'; treeKey: string; draft: VersionCatalogDraftSource }
  | { kind: 'committed'; key: string }

export function committedCatalogGoalKey(
  historyKey: string,
  version: string,
  ref: NonNullable<VersionCatalogEntry['material']['plan']>
): string {
  return JSON.stringify([historyKey, version, ref.cycleId, ref.revision, ref.sourceCommit])
}

export function draftCatalogTreeKey(
  scope: NativeWorkspaceScope,
  tree: VersionCatalogPlanTree
): string {
  return JSON.stringify([
    scope.projectId,
    tree.repoId ?? scope.repoId,
    tree.hostId ?? scope.hostId,
    tree.hostId ? (tree.runtimeOwnerEnvironmentId ?? '') : (scope.runtimeOwnerEnvironmentId ?? ''),
    tree.worktreeId,
    tree.instanceId ?? '',
    tree.version
  ])
}

/** A source failure preserves only that source's prior projection, never another tree's goals. */
export function retainUnavailableCatalogSources({
  entries,
  previousEntries,
  previousSources,
  goalSources,
  availableDraftVersions,
  unavailableDraftTrees,
  historyKey,
  retainHistory
}: {
  entries: VersionCatalogEntry[]
  previousEntries: readonly VersionCatalogEntry[]
  previousSources: Record<string, CatalogGoalSource> | undefined
  goalSources: Record<string, CatalogGoalSource>
  availableDraftVersions: ReadonlySet<string>
  unavailableDraftTrees: ReadonlySet<string>
  historyKey: string
  retainHistory: boolean
}): void {
  for (const previous of previousEntries) {
    const previousSource = previousSources?.[previous.version]
    const keepDraft =
      previousSource?.kind === 'draft' && unavailableDraftTrees.has(previousSource.treeKey)
        ? previousSource.draft
        : null
    const keepMaterial =
      retainHistory &&
      (previous.material.plan || previous.material.acceptance || previous.problems.length > 0)
    let entry = entries.find((item) => item.version === previous.version)
    if (!entry && (keepMaterial || keepDraft)) {
      entry = {
        version: previous.version,
        material: {},
        problems: [],
        goals: [],
        tasks: [],
        workspaces: [],
        state: 'retired'
      }
      entries.push(entry)
    }
    if (!entry) {
      continue
    }
    if (keepMaterial) {
      entry.material = { ...previous.material }
      entry.problems = [...previous.problems]
    }
    if (keepDraft && !entry.draft) {
      entry.draft = { cycleId: keepDraft.cycleId, revision: keepDraft.revision }
    }
    const keepCommittedGoals =
      keepMaterial &&
      previousSource?.kind === 'committed' &&
      entry.material.plan &&
      previousSource.key === committedCatalogGoalKey(historyKey, entry.version, entry.material.plan)
    if (!availableDraftVersions.has(entry.version) && (keepDraft || keepCommittedGoals)) {
      entry.goals = [...previous.goals]
      entry.tasks = [...previous.tasks]
      goalSources[entry.version] = previousSource!
    }
  }
}
