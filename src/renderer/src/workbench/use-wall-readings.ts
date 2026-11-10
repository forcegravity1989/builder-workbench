import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import { worktreeMatchesHost } from '@/store/slices/worktrees/listing/worktree-host-ownership'
import { getWorktreeHostIdentity } from '../../../shared/worktree/host-qualified-identity'
import type { Worktree } from '../../../shared/worktree/types'
import { worktreeFingerprintTuple } from './worktree-fingerprint'
import { readWallReadings } from './wall-readings-load'
import type { WallProject } from './workbench-wall-projects'
import { wallProjectVersionRows } from './workbench-wall-projects'
import type { WallCardReadings } from './wall-card-readings'

export function useWallReadings(
  projects: readonly WallProject[],
  token: number
): Record<string, WallCardReadings> {
  const visible = useAppStore((s) => s.worktreesByRepo)
  const detected = useAppStore((s) => s.detectedWorktreesByRepo)
  const [results, setResults] = useState<Record<string, { key: string; value: WallCardReadings }>>(
    {}
  )
  const inputs = useMemo(
    () =>
      projects.map((project) => {
        const trees = new Map<string, Worktree>()
        for (const repo of wallProjectVersionRows(project)) {
          for (const tree of [
            ...(visible[repo.id] ?? []),
            ...(detected[repo.id]?.worktrees ?? [])
          ]) {
            if (worktreeMatchesHost(tree, getRepoExecutionHostId(repo))) {
              trees.set(getWorktreeHostIdentity(tree), tree)
            }
          }
        }
        const worktrees = [...trees.values()]
        return {
          project,
          worktrees,
          key: JSON.stringify([
            token,
            wallProjectVersionRows(project).map((r) => [
              r.id,
              getRepoExecutionHostId(r),
              r.path,
              r.gitRemoteIdentity
            ]),
            worktrees.map(worktreeFingerprintTuple)
          ])
        }
      }),
    [projects, visible, detected, token]
  )
  const changed = inputs.filter((input) => results[input.project.key]?.key !== input.key)
  const changedKey = JSON.stringify(changed.map((input) => [input.project.key, input.key]))
  useEffect(() => {
    if (!changed.length) {
      return
    }
    let cancelled = false
    // Bound concurrent project reads; the native ports retain their own request caches.
    void (async () => {
      const queue = [...changed]
      const updates: typeof results = {}
      await Promise.all(
        Array.from({ length: Math.min(3, queue.length) }, async () => {
          while (queue.length && !cancelled) {
            const input = queue.shift()!
            updates[input.project.key] = {
              key: input.key,
              value: await readWallReadings(input.project, input.worktrees, token > 0)
            }
          }
        })
      )
      if (!cancelled) {
        setResults((previous) => ({ ...previous, ...updates }))
      }
    })()
    return () => {
      cancelled = true
    }
    // Inputs are owner-qualified and revision-keyed; unrelated store changes do not restart reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changedKey])
  return Object.fromEntries(
    inputs.map(({ project, key }) => [
      project.key,
      results[project.key]?.key === key ? results[project.key].value : { kind: 'loading' }
    ])
  )
}
