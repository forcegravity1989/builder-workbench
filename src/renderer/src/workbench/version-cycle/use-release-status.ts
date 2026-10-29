import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { ReleaseStatusResult } from '../../../../shared/workbench/release-status'
import type { WorkflowReleaseRef } from '../../../../shared/workbench/version-workflow'
import type { VersionCycleContext } from './cycle-context'

/** Focus re-reads are throttled: the row is a reminder, not a live Release mirror. */
const FOCUS_THROTTLE_MS = 60_000

type Identity = [
  { repoId: string; hostId: ExecutionHostId; runtimeOwnerEnvironmentId?: string } | null,
  string | null,
  WorkflowReleaseRef | null
]

/**
 * Status of the recorded release tag (#462), acceptance board only. No
 * reference means the version was never released — a material fact, rendered
 * as 未发布 without a read. With a reference, reads fire on identity change,
 * trunk-sync refresh, window focus (throttled) and the header's manual
 * refresh; unreadable stays unknown and a tag with no matching Release stays
 * missing — both real readings, rendered as text, no lamp derived.
 */
export function useReleaseStatus(
  context: VersionCycleContext,
  release: WorkflowReleaseRef | undefined
) {
  const { scope, worktreeId, releasePort } = context
  const key = JSON.stringify([
    scope
      ? {
          repoId: scope.repoId,
          hostId: scope.hostId,
          runtimeOwnerEnvironmentId: scope.runtimeOwnerEnvironmentId
        }
      : null,
    worktreeId,
    release ?? null
  ])
  const identity = useMemo(() => JSON.parse(key) as Identity, [key])
  const latest = useRef(key)
  latest.current = key
  const sequence = useRef(0)
  const lastRead = useRef(0)
  const [result, setResult] = useState<{ key: string; status: ReleaseStatusResult } | null>(null)
  const syncing = context.syncing
  const read = useCallback(async () => {
    const [scopePart, treeId, ref] = identity
    if (!scopePart || !treeId || !ref || syncing) {
      return
    }
    const token = ++sequence.current
    lastRead.current = Date.now()
    try {
      const status = await releasePort.readStatus({ ...scopePart, worktreeId: treeId }, ref)
      if (token === sequence.current && latest.current === key) {
        setResult({ key, status })
      }
    } catch (reason) {
      if (token === sequence.current && latest.current === key) {
        setResult({
          key,
          status: {
            state: 'unknown',
            reason: reason instanceof Error ? reason.message : String(reason)
          }
        })
      }
    }
  }, [identity, key, releasePort, syncing])
  useEffect(() => {
    void read()
  }, [read, context.materialRefresh])
  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - lastRead.current >= FOCUS_THROTTLE_MS) {
        void read()
      }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [read])
  const hasRef = Boolean(identity[2])
  return {
    status: hasRef && result?.key === key ? result.status : null,
    loading: hasRef && result?.key !== key,
    refresh: read
  }
}
