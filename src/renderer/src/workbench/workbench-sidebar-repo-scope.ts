import { useMemo } from 'react'
import { useAppStore } from '@/store'
import type { ProjectGroup } from '../../../shared/project-group-types'
import type { Repo } from '../../../shared/repo-types'
import { isWorkbenchShell } from './is-workbench-shell'
import { buildWallProjects } from './workbench-wall-projects'

const EMPTY_PROJECT_GROUPS: readonly ProjectGroup[] = []

/** Repo ids that belong to the wall project containing `activeRepoId`. */
export function resolveWallProjectRepoIds(
  repos: readonly Repo[],
  groups: readonly ProjectGroup[],
  activeRepoId: string | null | undefined
): readonly string[] | null {
  if (!activeRepoId) {
    return null
  }
  const hit = buildWallProjects(repos, groups).find((p) => p.repoIds.includes(activeRepoId))
  return hit ? hit.repoIds : [activeRepoId]
}

/** Intersect user filter with wall scope; empty user filter → wall scope alone. */
export function mergeWorkbenchFilterRepoIds(
  storeFilterRepoIds: readonly string[],
  wallRepoIds: readonly string[]
): readonly string[] {
  if (storeFilterRepoIds.length === 0) {
    return wallRepoIds
  }
  const wall = new Set(wallRepoIds)
  return storeFilterRepoIds.filter((id) => wall.has(id))
}

export function filterReposByWorkbenchScope<T extends { id: string }>(
  repos: readonly T[],
  wallRepoIds: readonly string[] | null
): readonly T[] {
  if (!wallRepoIds) {
    return repos
  }
  const allowed = new Set(wallRepoIds)
  return repos.filter((r) => allowed.has(r.id))
}

export function filterProjectGroupsByWorkbenchScope(
  groups: readonly ProjectGroup[],
  scopedRepos: readonly Repo[],
  wallRepoIds: readonly string[] | null
): readonly ProjectGroup[] {
  if (!wallRepoIds) {
    return groups
  }
  const groupIds = new Set(
    scopedRepos.map((r) => r.projectGroupId).filter((id): id is string => Boolean(id))
  )
  return groups.filter((g) => groupIds.has(g.id))
}

type SidebarFilterState = {
  filterRepoIds: readonly string[]
  [key: string]: unknown
}

/** Current wall project's repo ids, or null outside the Workbench shell / with no active repo. */
export function useWorkbenchWallRepoIds(): readonly string[] | null {
  const repos = useAppStore((s) => s.repos)
  const projectGroups = useAppStore((s) => s.projectGroups ?? EMPTY_PROJECT_GROUPS)
  const activeRepoId = useAppStore((s) => s.activeRepoId)
  return useMemo(() => {
    if (!isWorkbenchShell()) {
      return null
    }
    return resolveWallProjectRepoIds(repos, projectGroups, activeRepoId)
  }, [repos, projectGroups, activeRepoId])
}

/** TaskPage / other catalogs: keep only the active wall project's repos. */
export function useWorkbenchScopedRepos<T extends { id: string }>(
  repos: readonly T[]
): readonly T[] {
  const wallRepoIds = useWorkbenchWallRepoIds()
  return useMemo(() => filterReposByWorkbenchScope(repos, wallRepoIds), [repos, wallRepoIds])
}

/**
 * Workbench: sidebar only shows the active wall project's repos + worktrees.
 * Returns null wall scope outside the shell (callers keep store filters).
 */
export function useWorkbenchSidebarListScope<T extends SidebarFilterState>(
  filterState: T
): {
  filterState: T
  wallRepoIds: readonly string[] | null
  scopeRepos: <R extends { id: string }>(repos: readonly R[]) => readonly R[]
  scopeProjectGroups: (
    groups: readonly ProjectGroup[],
    scopedRepos: readonly Repo[]
  ) => readonly ProjectGroup[]
} {
  const wallRepoIds = useWorkbenchWallRepoIds()

  const scopedFilterState = useMemo(() => {
    if (!wallRepoIds) {
      return filterState
    }
    const nextIds = mergeWorkbenchFilterRepoIds(filterState.filterRepoIds, wallRepoIds)
    if (
      nextIds.length === filterState.filterRepoIds.length &&
      nextIds.every((id, i) => id === filterState.filterRepoIds[i])
    ) {
      return filterState
    }
    return { ...filterState, filterRepoIds: nextIds }
  }, [filterState, wallRepoIds])

  return {
    filterState: scopedFilterState,
    wallRepoIds,
    scopeRepos: <R extends { id: string }>(list: readonly R[]) =>
      filterReposByWorkbenchScope(list, wallRepoIds),
    scopeProjectGroups: (groups, scopedRepos) =>
      filterProjectGroupsByWorkbenchScope(groups, scopedRepos, wallRepoIds)
  }
}
