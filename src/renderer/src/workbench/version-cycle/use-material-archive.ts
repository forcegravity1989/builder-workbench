import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { VersionMaterial } from '../../../../shared/workbench/version-material'
import {
  isArchivedMaterial,
  type ArchiveStatus
} from '../../../../shared/workbench/version-archive'
import type { MaterialDraft } from './material-draft'
import type { ArchiveInput } from './ports'
import type { VersionCycleContext } from './cycle-context'

export function useMaterialArchive(
  context: VersionCycleContext,
  draft: MaterialDraft<VersionMaterial> | null
) {
  const { scope, worktreeId, archivePort } = context
  const input =
    draft?.expectedRevision && scope && worktreeId
      ? {
          ...scope,
          worktreeId,
          version: draft.document.version,
          cycleId: draft.document.cycleId,
          revision: draft.expectedRevision
        }
      : null
  const key = JSON.stringify(input)
  const identity = useMemo(() => JSON.parse(key) as ArchiveInput | null, [key])
  const latest = useRef(key)
  latest.current = key
  const sequence = useRef(0)
  const [result, setResult] = useState<{ key: string; status: ArchiveStatus } | null>(null)
  const readStatus = useCallback(async () => {
    if (!identity || context.syncing || draft?.dirty) {
      return
    }
    const token = ++sequence.current
    try {
      const status = await archivePort.readStatus(identity)
      if (token === sequence.current && latest.current === key) {
        setResult({ key, status })
      }
    } catch (reason) {
      if (token === sequence.current && latest.current === key) {
        setResult({ key, status: { kind: 'unknown', reason: String(reason) } })
      }
    }
  }, [key, identity, archivePort, context.syncing, draft?.dirty])
  useEffect(() => {
    const requests = sequence
    void readStatus()
    return () => {
      requests.current++
    }
  }, [readStatus, context.materialRefresh])
  const status: ArchiveStatus = draft?.dirty
    ? { kind: 'changed', reason: '当前材料有改动待归档' }
    : result?.key === key
      ? result.status
      : { kind: 'unknown', reason: '正在读取归档状态…' }
  return {
    status,
    archived: Boolean(identity && isArchivedMaterial(status, identity)),
    pending: Boolean(identity && !draft?.dirty && result?.key !== key),
    refresh: readStatus
  }
}
