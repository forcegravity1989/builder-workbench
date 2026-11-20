import { getRepoExecutionHostId, type ExecutionHostId } from '../../../shared/execution-host'
import type { Repo } from '../../../shared/repo-types'
import {
  compareVersionDisplayOrder,
  type VersionCatalogEntry
} from '../../../shared/workbench/version-catalog'
import type { Worktree } from '../../../shared/worktree/types'
import type { VersionCatalogState } from './use-version-catalog'

export type CatalogSource = { repo: Repo; state: VersionCatalogState }

export type ProjectVersionPreference = {
  version: string
  repoId: string
  hostId: ExecutionHostId
}

export type ProjectVersion = {
  entry: VersionCatalogEntry
  source: CatalogSource | null
  goalWorktrees: Worktree[]
  planOrderPending: boolean
}

function planIdentity(entry: VersionCatalogEntry | undefined): string | undefined {
  return entry?.draft?.cycleId ?? entry?.material.plan?.cycleId
}

function mergedStatus(
  candidates: { source: CatalogSource; entry: VersionCatalogEntry }[],
  primaryUnavailable: boolean
): VersionCatalogEntry['mergeStatus'] {
  if (candidates.some(({ entry }) => entry.mergeStatus === 'merged')) {
    return 'merged'
  }
  if (candidates.some(({ entry }) => entry.problems.some((problem) => problem.workflow === 'plan'))) {
    return 'unknown'
  }
  if (
    primaryUnavailable ||
    candidates.some(
      ({ source, entry }) => !source.state.materialReady && entry.mergeStatus === 'unknown'
    )
  ) {
    return 'unknown'
  }
  if (candidates.some(({ entry }) => entry.mergeStatus === 'unmerged')) {
    return 'unmerged'
  }
  return 'unknown'
}

function earliestPlanStart(
  candidates: { entry: VersionCatalogEntry }[]
): number | null | undefined {
  const times = candidates
    .map(({ entry }) => entry.planStartedAt)
    .filter((time): time is number => time !== undefined && time !== null && Number.isFinite(time))
  if (times.length > 0) {
    return Math.min(...times)
  }
  return candidates.some(({ entry }) => entry.planStartedAt !== undefined) ? null : undefined
}

export function mergeProjectVersions(
  sources: CatalogSource[],
  primary: CatalogSource | null,
  preference: ProjectVersionPreference | undefined,
  selectSource: (candidates: Repo[], repo: Repo) => Repo | null
): ProjectVersion[] {
  const versions = new Map<string, { source: CatalogSource; entry: VersionCatalogEntry }[]>()
  for (const source of sources) {
    for (const entry of source.state.catalog?.entries ?? []) {
      const candidates = versions.get(entry.version) ?? []
      candidates.push({ source, entry })
      versions.set(entry.version, candidates)
    }
  }
  return [...versions]
    .map(([version, candidates]): ProjectVersion => {
      const explicit = preference?.version === version ? preference : null
      const preferred = candidates.find(({ source }) => source === primary)
      // A read failure on the preferred host does not establish that this version
      // exists only on another host.
      const fallback =
        !preferred && primary?.state.materialReady
          ? selectSource(
              candidates.map(({ source }) => source.repo),
              candidates[0].source.repo
            )
          : null
      const automatic = preferred ?? candidates.find(({ source }) => source.repo === fallback)
      const orderSource =
        (automatic?.entry.planEnteredAt !== undefined && automatic.entry.planEnteredAt !== null
          ? automatic
          : null) ??
        candidates.find(
          ({ entry }) => entry.planEnteredAt !== undefined && entry.planEnteredAt !== null
        ) ??
        (automatic?.entry.planEnteredAt !== undefined
          ? automatic
          : candidates.find(({ entry }) => entry.planEnteredAt !== undefined))
      const chosen = explicit
        ? candidates.find(
            ({ source }) =>
              source.repo.id === explicit.repoId &&
              getRepoExecutionHostId(source.repo) === explicit.hostId
          )
        : automatic
      const workspaces = candidates.flatMap(({ entry }) => entry.workspaces)
      const materialIdentity = planIdentity(chosen?.entry)
      const draft = chosen?.entry.draft ?? candidates.find(({ entry }) => entry.draft)?.entry.draft
      return {
        source: chosen?.source ?? null,
        planOrderPending:
          !!orderSource?.entry.material.plan && orderSource.source.state.planOrderPending,
        entry: {
          version,
          mergeStatus: mergedStatus(
            candidates,
            primary !== null && !primary.state.materialReady
          ),
          planEnteredAt: orderSource?.entry.planEnteredAt,
          planStartedAt: earliestPlanStart(candidates),
          state: workspaces.length ? 'working' : 'retired',
          workspaces,
          goals: chosen?.entry.goals ?? [],
          material: chosen?.entry.material ?? {},
          draft,
          problems: chosen?.entry.problems ?? []
        },
        goalWorktrees: candidates.flatMap(({ source, entry }) =>
          source === chosen?.source ||
          (materialIdentity && planIdentity(entry) === materialIdentity)
            ? source.state.worktrees
            : []
        )
      }
    })
    .sort((a, b) => compareVersionDisplayOrder(a.entry, b.entry))
}
