import { useEffect, useMemo, useRef, useState } from 'react'
import type { PlanningProgressSource as ProgressSource } from '../../../../shared/workbench/version-material'
import type { CycleScope } from '../version-cycle/ports'
import { nativeVersionHistoryPort } from '../version-history-port'
import { readPlanningProgressSource } from './planning-progress-source'

export type ProgressMinutes =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; markdown: string }
  | { kind: 'error'; reason: string }

type Identity = [
  { repoId: string; hostId: string; runtimeOwnerEnvironmentId?: string } | null,
  string | null,
  ProgressSource | null
]

/**
 * Inline echo of the referenced acceptance minutes: the progress card shows the
 * read-only derivation whenever summary.progressSource is set. A read failure
 * stays honest — it never falls back to another record or to the latest material.
 * `refreshToken` re-reads the same source (trunk sync completion, manual refresh).
 */
export function useProgressMinutes(
  scope: CycleScope | null,
  worktreeId: string | null,
  source: ProgressSource | undefined,
  refreshToken?: number
): ProgressMinutes {
  const key = JSON.stringify([
    scope
      ? {
          repoId: scope.repoId,
          hostId: scope.hostId,
          runtimeOwnerEnvironmentId: scope.runtimeOwnerEnvironmentId
        }
      : null,
    worktreeId,
    source ?? null
  ])
  const identity = useMemo(() => JSON.parse(key) as Identity, [key])
  const history = useMemo(
    () => nativeVersionHistoryPort(identity[0]?.runtimeOwnerEnvironmentId),
    [identity]
  )
  const request = useRef(0)
  const [state, setState] = useState<{ key: string; value: ProgressMinutes }>({
    key,
    value: { kind: 'idle' }
  })
  useEffect(() => {
    const [scopePart, treeId, sourcePart] = identity
    if (!scopePart || !treeId || !sourcePart) {
      request.current++
      setState((current) => (current.key === key ? { key, value: { kind: 'idle' } } : current))
      return
    }
    const token = ++request.current
    setState({ key, value: { kind: 'loading' } })
    void readPlanningProgressSource(
      history,
      { repoId: scopePart.repoId, hostId: scopePart.hostId, worktreeId: treeId },
      sourcePart
    ).then(
      (result) => {
        if (request.current === token) {
          setState({ key, value: { kind: 'ready', markdown: result.markdown } })
        }
      },
      (reason: unknown) => {
        if (request.current === token) {
          setState({
            key,
            value: {
              kind: 'error',
              reason: reason instanceof Error ? reason.message : String(reason)
            }
          })
        }
      }
    )
  }, [key, identity, history, refreshToken])
  return state.key === key ? state.value : { kind: 'loading' }
}
