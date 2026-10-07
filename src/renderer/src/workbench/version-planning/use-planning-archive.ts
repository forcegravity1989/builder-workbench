import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'
import { isArchivedMaterial } from '../../../../shared/workbench/version-archive'
import type { ArchiveStatus } from '../version-cycle/ports'
import type { MaterialDraft } from '../version-cycle/material-draft'
import type { VersionCycleContext } from '../version-cycle/cycle-context'

type Draft = MaterialDraft<PlanningMaterial>
function roundIdentity(draft: Draft | null) {
  return draft ? JSON.stringify([draft.document.version, draft.document.cycleId]) : null
}

function identity(draft: Draft | null) {
  return draft?.expectedRevision
    ? JSON.stringify([draft.document.version, draft.document.cycleId, draft.expectedRevision])
    : null
}

function archived(status: ArchiveStatus, draft: Draft) {
  return Boolean(
    draft.expectedRevision &&
    isArchivedMaterial(status, {
      workflow: 'plan',
      version: draft.document.version,
      cycleId: draft.document.cycleId,
      revision: draft.expectedRevision
    })
  )
}

/** A save may advance revision while typing; share the exact status read with flush. */
export function usePlanningArchive(context: VersionCycleContext, draft: Draft | null) {
  const { scope, worktreeId, archivePort } = context
  const key = identity(draft)
  const roundKey = roundIdentity(draft)
  const [, refresh] = useState(0)
  const lifetime = useMemo(
    () => ({
      scope,
      worktreeId,
      archivePort,
      active: true,
      read: null as { key: string; roundKey: string; status: ArchiveStatus } | null,
      pending: null as { key: string; promise: Promise<ArchiveStatus> } | null
    }),
    [scope, worktreeId, archivePort]
  )
  useEffect(() => {
    lifetime.active = true
    return () => {
      lifetime.active = false
    }
  }, [lifetime])
  const readStatus = useCallback(
    async (candidate: Draft): Promise<ArchiveStatus | null> => {
      const candidateKey = identity(candidate)
      if (
        !lifetime.active ||
        !scope ||
        !worktreeId ||
        !candidateKey ||
        !candidate.expectedRevision
      ) {
        return null
      }
      if (lifetime.read?.key === candidateKey) {
        return lifetime.read.status
      }
      if (lifetime.pending?.key === candidateKey) {
        return lifetime.pending.promise
      }
      const promise = archivePort
        .readStatus({
          ...scope,
          worktreeId,
          version: candidate.document.version,
          cycleId: candidate.document.cycleId,
          revision: candidate.expectedRevision
        })
        .catch((reason): ArchiveStatus => ({ kind: 'unknown', reason: String(reason) }))
      const request = { key: candidateKey, promise }
      lifetime.pending = request
      const status = await promise
      if (lifetime.active && lifetime.pending === request) {
        lifetime.read = { key: candidateKey, roundKey: roundIdentity(candidate)!, status }
        lifetime.pending = null
        refresh((value) => value + 1)
      }
      return status
    },
    [lifetime, scope, worktreeId, archivePort]
  )
  useEffect(() => {
    if (draft) {
      void readStatus(draft)
    }
  }, [draft, readStatus])
  const status: ArchiveStatus =
    lifetime.read?.key === key ? lifetime.read.status : { kind: 'unknown', reason: '尚未读取' }
  const canSave = useCallback(
    (candidate: Draft) =>
      Boolean(
        lifetime.active &&
        !context.syncing &&
        lifetime.read?.key === identity(candidate) &&
        !archived(lifetime.read.status, candidate)
      ),
    [lifetime, context.syncing]
  )
  const waitForSave = useCallback(
    async (candidate: Draft) => {
      if (context.syncing) {
        return false
      }
      const result = await readStatus(candidate)
      return Boolean(lifetime.active && result && !archived(result, candidate))
    },
    [lifetime, readStatus, context.syncing]
  )
  return {
    status,
    archived: Boolean(draft && archived(status, draft)),
    pending: Boolean(key && lifetime.read?.key !== key),
    initialCheckPending: Boolean(key && lifetime.read?.roundKey !== roundKey),
    canSave,
    waitForSave
  }
}
