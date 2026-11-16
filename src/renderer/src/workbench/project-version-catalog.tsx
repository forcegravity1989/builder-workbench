import { versionTreeKey } from './version-material-selection'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import {
  getRepoExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '../../../shared/execution-host'
import type { Repo } from '../../../shared/repo-types'
import type { VersionCatalogEntry } from '../../../shared/workbench/version-catalog'
import { versionRepoIdentity } from '../../../shared/workbench/version-repo-identity'
import { isWallRowVisible } from './workbench-wall-projects'
import { resolveProjectSource } from './project-source-resolution'
import { useVersionCatalogForRepo, type VersionCatalogState } from './use-version-catalog'
import { versionCatalogSourceKey } from './version-catalog-source'
import type { Worktree } from '../../../shared/worktree/types'
import { wallReadRevision, type useWallRefresh } from './wall-refresh'

type CatalogSource = { repo: Repo; state: VersionCatalogState }
type Reader = { repo: Repo; key: string }

function CatalogReader({
  reader,
  revision,
  report
}: {
  reader: Reader
  revision: number
  report: (key: string, state: VersionCatalogState | null) => void
}) {
  const { repo, key } = reader
  const state = useVersionCatalogForRepo(repo.id, getRepoExecutionHostId(repo), revision, true)
  useEffect(() => report(key, state), [key, report, state])
  useEffect(() => () => report(key, null), [key, report])
  return null
}

function sameRegistration(a: Repo, b: Repo): boolean {
  return a.id === b.id && getRepoExecutionHostId(a) === getRepoExecutionHostId(b)
}

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

function mergeProjectVersions(
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

/** The wall and sidebar read the same registrations independently of presentation filters. */
export function useProjectVersionCatalog(
  primaryRepo: Repo | null,
  refresh?: ReturnType<typeof useWallRefresh>,
  preference?: ProjectVersionPreference
) {
  const repos = useAppStore((state) => state.repos)
  const environments = useAppStore((state) => state.runtimeEnvironments)
  const readers = useMemo(() => {
    if (!primaryRepo || primaryRepo.kind === 'folder') {
      return []
    }
    const identity = versionRepoIdentity(primaryRepo)
    return repos.flatMap((repo) => {
      if (
        !sameRegistration(repo, primaryRepo) &&
        (!identity || versionRepoIdentity(repo) !== identity)
      ) {
        return []
      }
      const host = parseExecutionHostId(getRepoExecutionHostId(repo))
      if (
        !isWallRowVisible(repo) ||
        (host?.kind === 'runtime' && !environments.some((entry) => entry.id === host.environmentId))
      ) {
        return []
      }
      return [{ repo, key: versionCatalogSourceKey([repo]) }]
    })
  }, [environments, primaryRepo, repos])
  const [reads, setReads] = useState<Record<string, VersionCatalogState | null>>({})
  const report = useCallback((key: string, state: VersionCatalogState | null) => {
    setReads((current) => (current[key] === state ? current : { ...current, [key]: state }))
  }, [])
  const sources = useMemo(
    () =>
      readers.flatMap(({ repo, key }) => {
        const state = reads[key]
        return state ? [{ repo, state }] : []
      }),
    [readers, reads]
  )
  const primary =
    sources.find(({ repo }) => primaryRepo && sameRegistration(repo, primaryRepo)) ?? null
  const versions = useMemo(
    () =>
      mergeProjectVersions(sources, primary, preference, (candidates, repo) =>
        candidates.length === 1
          ? repo
          : resolveProjectSource({ ...useAppStore.getState(), repos: candidates }, repo)
      ),
    [sources, primary, preference]
  )
  const catalogReaders = readers.map((reader) => (
    <CatalogReader
      key={reader.key}
      reader={reader}
      revision={
        refresh ? Math.max(refresh.visitRevision, wallReadRevision(refresh, [reader.repo])) : 0
      }
      report={report}
    />
  ))
  const worktrees = useMemo(
    () => [
      ...new Map(
        sources.flatMap(({ state }) =>
          state.worktrees.map((tree) => [versionTreeKey(tree), tree] as const)
        )
      ).values()
    ],
    [sources]
  )
  return {
    catalogReaders,
    versions,
    primary: primary?.state ?? null,
    worktrees,
    repoIds: readers.map(({ repo }) => repo.id),
    loading: readers.length > sources.length || sources.some(({ state }) => state.loading),
    errors: sources.flatMap(({ state }) =>
      [
        state.error,
        state.materialError,
        ...(state.catalog?.problems.map(({ message }) => message) ?? [])
      ].filter((message): message is string => Boolean(message))
    ),
    reload: () => sources.forEach(({ state }) => state.reload())
  }
}
