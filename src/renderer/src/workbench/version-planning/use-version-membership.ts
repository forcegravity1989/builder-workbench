import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { createCodeHubApi } from '@/lib/codehub-api'
import { getTaskPageRepoSourceContext } from '@/components/task-page-source-context'
import {
  getGitHubWorkItemRequestContext,
  listGitHubWorkItemsForRepo
} from '@/store/github/work-item-routing'
import { isCodeHubGitRemote } from '../../../../shared/codehub'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import { workbenchVersionTaskLabel } from '../../../../shared/workbench/task-scope'
import type { Repo } from '../../../../shared/repo-types'
import type { VersionTaskReference } from '../../../../shared/workbench/version-material'
import { resolveMemberGoalId } from '../../../../shared/workbench/version-membership'
import type { CycleScope } from '../version-cycle/ports'
import { requireSourceContext } from '../task-reference-repo'

export type VersionMembership = {
  /** Live members; `null` = fall back to `legacyTasks` (unresolved/unsupported/historical). */
  references: VersionTaskReference[] | null
  error: string | null
  busy: boolean
  refresh(): void
}

/** Host-aware repo lookup: the plan scope names repo + execution host; duplicate
 * bare ids across hosts must not cross hosts (mirrors resolveReferenceRepo). */
function resolvePlanRepo(repos: readonly Repo[], scope: CycleScope | null): Repo | undefined {
  if (!scope) {
    return undefined
  }
  const sameId = repos.filter((repo) => repo.id === scope.repoId)
  return sameId.find((repo) => getRepoExecutionHostId(repo) === scope.hostId) ?? sameId[0]
}

/**
 * Live version membership by `bw:plan:<version>` label (#588). The plan board no
 * longer depends on hand-edited material.tasks; it asks the provider which
 * Issues carry the version label and resolves each goal from the title token.
 *
 * Returns `null` references (caller falls back to `legacyTasks`) for: no scope,
 * a historical version whose Issues predate the label (query empty while the
 * material still lists tasks). An empty array means a genuinely empty plan.
 * Failures (repo unresolved, provider error) surface in `error` with `null`
 * references so the board shows unknown and the refresh button stays available.
 */
export function useVersionMembership(args: {
  scope: CycleScope | null
  version: string
  goalIds: readonly string[]
  legacyTasks: readonly VersionTaskReference[] | undefined
}): VersionMembership {
  const { scope, version, goalIds, legacyTasks } = args
  const repos = useAppStore((state) => state.repos)
  const [references, setReferences] = useState<VersionTaskReference[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [nonce, setNonce] = useState(0)

  const goalKey = JSON.stringify(goalIds)
  const repo = useMemo(() => resolvePlanRepo(repos, scope), [repos, scope])
  const key = useMemo(
    () =>
      scope && version
        ? JSON.stringify([
            scope.projectId,
            scope.repoId,
            scope.hostId,
            scope.runtimeOwnerEnvironmentId ?? null,
            version,
            goalKey,
            nonce,
            repo?.path ?? null
          ])
        : null,
    [scope, version, goalKey, nonce, repo]
  )

  useEffect(() => {
    if (!scope || !version) {
      setReferences(null)
      setError(null)
      setBusy(false)
      return
    }
    if (!repo) {
      // Repos hydrate slightly after mount; including repo.path in `key` re-runs
      // this once it appears. Until then the board honestly shows unknown.
      setReferences(null)
      setError('未找到本版所属仓库，无法按版本标签读取成员')
      setBusy(false)
      return
    }
    const goalSet = new Set(goalIds)
    let active = true
    // Reset first so a scope/version switch never shows the previous version's
    // members while the new query is in flight.
    setReferences(null)
    setError(null)
    setBusy(true)
    void (async () => {
      try {
        const label = workbenchVersionTaskLabel(version)
        let refs: VersionTaskReference[]
        if (isCodeHubGitRemote(repo.gitRemoteIdentity)) {
          // Scope the CodeHub client to the plan's own execution host (parity
          // with the GitHub branch) instead of the focused runtime.
          const api = createCodeHubApi(requireSourceContext(repo, 'codehub'))
          const listing = await api.listTasks({
            repoPath: repo.path,
            repoId: repo.id,
            kind: 'issue',
            state: 'all',
            limit: 250,
            labels: [label]
          })
          refs = listing.items.map((item) => {
            const goalId = resolveMemberGoalId(item.title, goalSet)
            return {
              provider: 'codehub',
              repository: repo.id,
              number: item.iid,
              ...(goalId ? { goalId } : {})
            }
          })
        } else {
          const state = useAppStore.getState()
          const sourceContext = getTaskPageRepoSourceContext(repo, 'github')
          const context = getGitHubWorkItemRequestContext(
            state,
            state.settings,
            repo.id,
            repo.path,
            sourceContext
          )
          const listing = await listGitHubWorkItemsForRepo(context, {
            // `label:` qualifier (not bare text) so the version label is an exact
            // filter; the value legitimately contains colons (bw:plan:v0.7).
            query: `is:issue label:${label}`,
            limit: 200
          })
          refs = listing.items.map((item) => {
            const goalId = resolveMemberGoalId(item.title, goalSet)
            return {
              provider: 'github',
              repository: repo.id,
              number: item.number,
              ...(goalId ? { goalId } : {})
            }
          })
        }
        if (!active) {
          return
        }
        const seen = new Set<string>()
        const deduped = refs
          .filter((ref) => {
            const refKey = `${ref.provider}:${ref.repository}:${ref.number}`
            if (seen.has(refKey)) {
              return false
            }
            seen.add(refKey)
            return true
          })
          .sort((a, b) => a.number - b.number)
        // Historical plan whose Issues predate the label: prefer the material's
        // own list rather than showing an empty board.
        if (deduped.length === 0 && (legacyTasks?.length ?? 0) > 0) {
          setReferences(null)
          return
        }
        setReferences(deduped)
      } catch (reason) {
        if (active) {
          setError(reason instanceof Error ? reason.message : String(reason))
          setReferences(null)
        }
      } finally {
        if (active) {
          setBusy(false)
        }
      }
    })()
    return () => {
      active = false
    }
    // `key` encodes scope/version/goals/hydrated-repo/nonce; goalIds and
    // legacyTasks are read from the render that produced this key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { references, error, busy, refresh: () => setNonce((value) => value + 1) }
}
