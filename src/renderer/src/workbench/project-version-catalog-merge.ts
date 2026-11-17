import { getRepoExecutionHostId, type ExecutionHostId } from '../../../shared/execution-host'
import type { Repo } from '../../../shared/repo-types'
import type { VersionCatalogEntry } from '../../../shared/workbench/version-catalog'
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
}

function planIdentity(entry: VersionCatalogEntry | undefined): string | undefined {
  return entry?.draft?.cycleId ?? entry?.material.plan?.cycleId
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
  return [...versions].map(([version, candidates]) => {
    const explicit = preference?.version === version ? preference : null
    const preferred = candidates.find(({ source }) =>
      explicit
        ? source.repo.id === explicit.repoId &&
          getRepoExecutionHostId(source.repo) === explicit.hostId
        : source === primary
    )
    // A read failure on the preferred host does not establish that this version
    // exists only on another host.
    const fallback =
      !explicit && !preferred && primary?.state.materialReady
        ? selectSource(
            candidates.map(({ source }) => source.repo),
            candidates[0].source.repo
          )
        : null
    const chosen = preferred ?? candidates.find(({ source }) => source.repo === fallback)
    const workspaces = candidates.flatMap(({ entry }) => entry.workspaces)
    const materialIdentity = planIdentity(chosen?.entry)
    return {
      source: chosen?.source ?? null,
      entry: {
        version,
        state: workspaces.length ? 'working' : 'retired',
        workspaces,
        goals: chosen?.entry.goals ?? [],
        material: chosen?.entry.material ?? {},
        draft: chosen?.entry.draft,
        problems: chosen?.entry.problems ?? []
      },
      goalWorktrees: candidates.flatMap(({ source, entry }) =>
        source === chosen?.source || (materialIdentity && planIdentity(entry) === materialIdentity)
          ? source.state.worktrees
          : []
      )
    }
  })
}
