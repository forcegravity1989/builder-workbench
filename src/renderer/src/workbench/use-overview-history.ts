import { useCallback, useEffect, useMemo, useState } from 'react'
import type { VersionHistoryCatalog } from '../../../shared/workbench/version-history'
import type { NativeWorkspaceScope } from './version-cycle/native-workspace'
import { nativeVersionHistoryPort } from './version-history-port'
import { nativeVersionMaterialPort } from './version-material-port'
import { createOverviewSnapshotCache, useOverviewSnapshot } from './overview-snapshot-cache'

const cache = createOverviewSnapshotCache(() => ({
  history: null as VersionHistoryCatalog | null,
  loaded: false,
  busy: false,
  problem: null as string | null
}))

export function useOverviewHistory(args: {
  baseScope: NativeWorkspaceScope | null
  baseWorktreeId: string | null
  planWorktreeId: string | null
  acceptanceWorktreeId: string | null
  identity: string
}) {
  const { baseScope, baseWorktreeId, planWorktreeId, acceptanceWorktreeId, identity } = args
  const key = JSON.stringify([identity, baseWorktreeId])
  const entry = useMemo(() => cache(key), [key])
  const snapshot = useOverviewSnapshot(entry)
  const [context, setContext] = useState<{
    key: string
    version: string | null
    plan: string | null
    acceptance: string | null
  } | null>(null)
  const [retry, setRetry] = useState(0)
  const load = useCallback(
    (force = false) => {
      if (!baseScope || !baseWorktreeId || entry.pending || (!force && entry.read().loaded)) {
        return
      }
      const scope = {
        repoId: baseScope.repoId,
        worktreeId: baseWorktreeId,
        hostId: baseScope.hostId
      }
      const port = nativeVersionHistoryPort(baseScope.runtimeOwnerEnvironmentId)
      entry.publish({ ...entry.read(), busy: true })
      entry.pending = (async () => {
        try {
          const history = await port.list({ scope, currentOnly: true })
          entry.publish({ history, loaded: true, busy: false, problem: null })
        } catch (error) {
          entry.publish({
            ...entry.read(),
            loaded: true,
            busy: false,
            problem: `版本材料：${String(error)}`
          })
        } finally {
          entry.pending = null
        }
      })()
    },
    [baseScope, baseWorktreeId, entry]
  )
  useEffect(() => {
    load()
  }, [load])
  const baseline = snapshot.history?.baselineCommit
  const contextKey = JSON.stringify([key, baseline, planWorktreeId, acceptanceWorktreeId, retry])
  useEffect(() => {
    if (!baseScope || !baseWorktreeId || !baseline) {
      return
    }
    let cancelled = false
    const owner = baseScope.runtimeOwnerEnvironmentId
    const history = nativeVersionHistoryPort(owner)
    const scope = { repoId: baseScope.repoId, hostId: baseScope.hostId }
    const aligned = async (worktreeId: string | null) => {
      if (!worktreeId) {
        return null
      }
      try {
        const tree = await history.listTreePlans({
          scope: { ...scope, worktreeId },
          adoptedCommit: baseline
        })
        return tree.alignment === 'aligned' ? worktreeId : null
      } catch {
        return null
      }
    }
    void Promise.all([aligned(planWorktreeId), aligned(acceptanceWorktreeId)]).then(
      async ([plan, acceptance]) => {
        const selected = plan
          ? await nativeVersionMaterialPort({ ...scope, worktreeId: plan, workflow: 'plan' }, owner)
              .context()
              .catch(() => ({ version: null }))
          : { version: null }
        if (!cancelled) {
          setContext({ key: contextKey, version: selected.version, plan, acceptance })
        }
      }
    )
    return () => {
      cancelled = true
    }
  }, [baseScope, baseWorktreeId, planWorktreeId, acceptanceWorktreeId, baseline, contextKey])
  const readyContext = context?.key === contextKey ? context : null
  const knownVersion =
    readyContext?.version &&
    [...(snapshot.history?.records ?? []), ...(snapshot.history?.problems ?? [])].some(
      (item) => item.version === readyContext.version
    )
      ? readyContext.version
      : null
  return {
    ...snapshot,
    currentVersion: knownVersion,
    planWorktreeId: readyContext?.plan ?? null,
    acceptanceWorktreeId: readyContext?.acceptance ?? null,
    retry,
    reload: () => {
      load(true)
      setRetry((value) => value + 1)
    }
  }
}
