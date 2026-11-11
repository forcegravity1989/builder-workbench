import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { branchName } from '@/lib/git-utils'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import { worktreeMatchesHost } from '@/store/slices/worktrees/listing/worktree-host-ownership'
import { getWorktreeHostIdentity } from '../../../shared/worktree/host-qualified-identity'
import type { Worktree } from '../../../shared/worktree/types'
import { worktreeFingerprintTuple } from './worktree-fingerprint'
import { readWallReadings } from './wall-readings-load'
import type { WallProject } from './workbench-wall-projects'
import { wallProjectVersionRows } from './workbench-wall-projects'
import type { WallCardReadings } from './wall-card-readings'
import { CHARTER_BRANCH } from './project-charter'
import { createWallCardCache, useWallCardReads } from './use-wall-card-reads'
import { type useWallRefresh, wallReadRevision } from './wall-refresh'

const cache = createWallCardCache<WallCardReadings>()

export function useWallReadings(
  projects: readonly WallProject[],
  refresh: ReturnType<typeof useWallRefresh>
) {
  const visible = useAppStore((s) => s.worktreesByRepo)
  const detected = useAppStore((s) => s.detectedWorktreesByRepo)
  const reads = useMemo(
    () =>
      projects.map((project) => {
        const rows = wallProjectVersionRows(project)
        const trees = new Map<string, Worktree>()
        for (const repo of rows) {
          for (const tree of [
            ...(visible[repo.id] ?? []),
            ...(detected[repo.id]?.worktrees ?? [])
          ]) {
            if (worktreeMatchesHost(tree, getRepoExecutionHostId(repo))) {
              const key = JSON.stringify([
                getWorktreeHostIdentity(tree),
                tree.runtimeOwnerEnvironmentId
              ])
              trees.set(key, tree)
            }
          }
        }
        const worktrees = [...trees.values()].filter(
          (tree) =>
            tree.isMainWorktree ||
            tree.workbenchVersionBinding ||
            branchName(tree.branch) !== CHARTER_BRANCH
        )
        return {
          projectKey: project.key,
          sourceKey: JSON.stringify([
            rows.map((r) => [
              getRepoExecutionHostId(r),
              r.id,
              r.path,
              r.kind,
              r.worktreeBaseRef,
              r.gitRemoteIdentity,
              r.issueSourcePreference,
              r.upstream
            ]),
            worktrees.map((tree) => [
              getWorktreeHostIdentity(tree),
              tree.runtimeOwnerEnvironmentId,
              tree.projectId,
              tree.head,
              tree.branch,
              tree.isMainWorktree,
              worktreeFingerprintTuple(tree)
            ])
          ]),
          revision: wallReadRevision(refresh, rows),
          load: (force: boolean) => readWallReadings(project, worktrees, force)
        }
      }),
    [projects, visible, detected, refresh]
  )
  return useWallCardReads(reads, cache)
}
