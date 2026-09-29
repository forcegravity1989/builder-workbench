import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'
import type { VersionDocumentSnapshot } from '../../../../shared/workbench/version-document'
import type { MaterialDraft, MaterialDraftController } from '../version-cycle/material-draft'

export type PlanningAutosaveOptions = {
  /** The board owns archive/selection guards; recheck them immediately before each write. */
  canSave(draft: MaterialDraft<PlanningMaterial>): boolean
  /** Await a pending archive read for this revision; a refusal is never retried automatically. */
  waitForSave?(draft: MaterialDraft<PlanningMaterial>): Promise<boolean>
  debounceMs?: number
}

type Snapshot = VersionDocumentSnapshot<PlanningMaterial>

/** Serializes the existing CAS controller; no second material store or write protocol. */
export function usePlanningAutosave({
  controller,
  draft,
  options,
  isCurrent,
  selection,
  onSaved
}: {
  controller: MaterialDraftController<PlanningMaterial> | null
  draft: MaterialDraft<PlanningMaterial> | null
  options?: PlanningAutosaveOptions
  isCurrent(): boolean
  selection: { current: { value: number } }
  onSaved(): Promise<void>
}) {
  const policy = useRef(options)
  policy.current = options
  const work = useMemo(
    () => ({ controller, pending: null as Promise<Snapshot | null> | null, token: 0 }),
    [controller]
  )
  const [saving, setSaving] = useState<{ work: typeof work; token: number } | null>(null)

  const flush: () => Promise<Snapshot | null> = useCallback((): Promise<Snapshot | null> => {
    if (work.pending) {
      return work.token === selection.current.value
        ? work.pending
        : work.pending.then(() => flush())
    }
    const original = controller?.value
    if (!controller || !original || !isCurrent()) {
      return Promise.resolve(null)
    }
    const token = selection.current.value
    const current = () =>
      isCurrent() &&
      token === selection.current.value &&
      controller.value?.document.version === original.document.version &&
      controller.value?.document.cycleId === original.document.cycleId
    const saveAll = async (): Promise<Snapshot | null> => {
      setSaving({ work, token })
      let wrote = false
      try {
        while (current()) {
          const value = controller.value!
          // A null remote is a deleted file conflict, not permission to recreate it.
          if (value.remote !== undefined) {
            return null
          }
          if (!value.dirty) {
            if (wrote) {
              void onSaved()
            }
            return value.expectedRevision
              ? { document: value.document, revision: value.expectedRevision }
              : null
          }
          if (policy.current && !policy.current.canSave(value)) {
            if (!(await policy.current.waitForSave?.(value)) || !current()) {
              return null
            }
            // Re-read the controller after the check: typing or model refresh may have changed it.
            continue
          }
          if (!(await controller.save())) {
            return null
          }
          wrote = true
          // Edits made during the request remain dirty with the returned revision.
          // Drain them before handing a revision to version selection or archive.
        }
        return null
      } finally {
        if (isCurrent() && token === selection.current.value) {
          setSaving(null)
        }
      }
    }
    const pending = saveAll()
    work.token = token
    work.pending = pending
    const release = () => {
      if (work.pending === pending) {
        work.pending = null
      }
    }
    void pending.then(release, release)
    return pending
  }, [controller, isCurrent, onSaved, selection, work])

  const save = useCallback(async () => Boolean(await flush()), [flush])
  useEffect(() => {
    if (
      !options ||
      !draft?.dirty ||
      draft.error ||
      draft.remote !== undefined ||
      !options.canSave(draft)
    ) {
      return
    }
    const timer = setTimeout(() => void flush(), options.debounceMs ?? 600)
    return () => clearTimeout(timer)
  }, [draft, options, flush])

  return { flush, save, saving: saving?.work === work && saving.token === selection.current.value }
}
