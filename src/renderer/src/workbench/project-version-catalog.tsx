import { versionTreeKey } from './version-material-selection'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSameRepoRow } from '@/store/repos/repo-host-identity'
import { useAppStore } from '@/store'
import {
  getRepoExecutionHostId,
  parseExecutionHostId
} from '../../../shared/execution-host/execution-host'
import type { Repo } from '../../../shared/repository/repo-types'
import { versionRepoIdentity } from '../../../shared/workbench/version-repo-identity'
import { isWallRowVisible } from './workbench-wall-projects'
import { resolveProjectSource } from './project-source-resolution'
import { useVersionCatalogForRepo, type VersionCatalogState } from './use-version-catalog'
import { versionCatalogSourceKey } from './version-catalog-source'
import { wallReadRevision, type useWallRefresh } from './wall-refresh'
import {
  mergeProjectVersions,
  type ProjectVersionPreference
} from './project-version-catalog-merge'
type Reader = { repo: Repo; key: string }
type CatalogRead = { state: VersionCatalogState; errors: string[] }

export function versionCatalogErrors(state: VersionCatalogState | null | undefined): string[] {
  if (!state) {
    return []
  }
  return [
    ...new Set(
      [
        state.error,
        state.materialError,
        ...(state.catalog?.problems.map(({ message }) => message) ?? [])
      ].filter((message): message is string => Boolean(message))
    )
  ]
}

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

/** The wall and sidebar read the same registrations independently of presentation filters. */
export function useProjectVersionCatalog(
  primaryRepo: Repo | null,
  refresh?: ReturnType<typeof useWallRefresh>,
  preference?: ProjectVersionPreference,
  registrationOnly = false
) {
  const repos = useAppStore((state) => state.repos)
  const environments = useAppStore((state) => state.runtimeEnvironments)
  const readers = useMemo(() => {
    if (!primaryRepo || primaryRepo.kind === 'folder') {
      return []
    }
    const identity = versionRepoIdentity(primaryRepo)
    return repos.flatMap((repo) => {
      if (registrationOnly && !isSameRepoRow(repo, primaryRepo)) {
        return []
      }
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
  }, [environments, primaryRepo, repos, registrationOnly])
  const [reads, setReads] = useState<Record<string, CatalogRead>>({})
  const report = useCallback((key: string, state: VersionCatalogState | null) => {
    setReads((current) => {
      const previous = current[key]
      if (!state) {
        if (!previous) {
          return current
        }
        const next = { ...current }
        delete next[key]
        return next
      }
      if (previous?.state === state) {
        return current
      }
      const errors = state.loading ? (previous?.errors ?? []) : versionCatalogErrors(state)
      return { ...current, [key]: { state, errors } }
    })
  }, [])
  const sources = useMemo(
    () =>
      readers.flatMap(({ repo, key }) => {
        const read = reads[key]
        return read ? [{ repo, ...read }] : []
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
    // An unmerged version has its own workspace time and can be shown while
    // merged-plan Git entry times are still loading.
    planOrderPending:
      versions[0]?.entry.mergeStatus === 'unmerged'
        ? false
        : versions.some((version) => version.planOrderPending),
    firstCurrentSourceError: sources
      .map(({ state }) => versionCatalogErrors(state)[0])
      .find(Boolean),
    sourceProblems: sources.flatMap(({ repo, state, errors }) =>
      errors.length
        ? [
            {
              key: versionCatalogSourceKey([repo]),
              hostId: getRepoExecutionHostId(repo),
              errors,
              loading: state.loading,
              retry: state.reload
            }
          ]
        : []
    )
  }
}
