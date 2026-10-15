import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { ArchivePrStatusResult } from '../../../../shared/workbench/archive-pr-status'
import type { WorkflowArchivePr } from '../../../../shared/workbench/version-workflow'
import type { VersionCycleContext } from './cycle-context'

/** Focus re-reads are throttled: the row is a reminder, not a live PR mirror. */
const FOCUS_THROTTLE_MS = 60_000

type Identity = [
  { repoId: string; hostId: ExecutionHostId; runtimeOwnerEnvironmentId?: string } | null,
  string | null,
  WorkflowArchivePr | null
]

/**
 * Status of the recorded archive PR, shared by both cycle screens. Reads fire on
 * reference identity change, trunk-sync refresh, window focus (throttled) and the
 * header's manual refresh; unreadable stays unknown. The journey lamp does not
 * come from here — it follows workflow.stage in the material.
 */
export function useArchivePrStatus(
  context: VersionCycleContext,
  archivePr: WorkflowArchivePr | undefined
) {
  const { scope, worktreeId, archivePort } = context
  const key = JSON.stringify([
    scope
      ? {
          repoId: scope.repoId,
          hostId: scope.hostId,
          runtimeOwnerEnvironmentId: scope.runtimeOwnerEnvironmentId
        }
      : null,
    worktreeId,
    archivePr ?? null
  ])
  const identity = useMemo(() => JSON.parse(key) as Identity, [key])
  const latest = useRef(key)
  latest.current = key
  const sequence = useRef(0)
  const lastRead = useRef(0)
  const [result, setResult] = useState<{ key: string; status: ArchivePrStatusResult } | null>(null)
  const syncing = context.syncing
  const read = useCallback(async () => {
    const [scopePart, treeId, pr] = identity
    if (!scopePart || !treeId || !pr || syncing) {
      return
    }
    const token = ++sequence.current
    lastRead.current = Date.now()
    try {
      const status = await archivePort.readStatus({ ...scopePart, worktreeId: treeId }, pr)
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
  }, [identity, key, archivePort, syncing])
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
  const hasPr = Boolean(identity[2])
  return {
    status: hasPr && result?.key === key ? result.status : null,
    loading: hasPr && result?.key !== key,
    refresh: read
  }
}
