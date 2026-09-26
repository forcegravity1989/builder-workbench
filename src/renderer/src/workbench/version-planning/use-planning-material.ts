import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  PlanningMaterialSchema,
  type PlanningMaterial
} from '../../../../shared/workbench/version-material'
import { validatePlanningVersion } from '../../../../shared/workbench/version-document'
import type { VersionMaterialCandidate } from '../../../../shared/workbench/version-material-request'
import type { nativeVersionMaterialPort } from '../version-material-port'
import { MaterialDraftController, type MaterialDraft } from '../version-cycle/material-draft'

export function planningDraftKey(scopeKey: string, version: string) {
  return `workbench.plan.draft:${scopeKey}:${encodeURIComponent(version)}`
}

export function usePlanningMaterial(
  port: ReturnType<typeof nativeVersionMaterialPort> | null,
  scopeKey: string
) {
  const [versions, setVersions] = useState<VersionMaterialCandidate[]>([])
  const [draft, setDraft] = useState<MaterialDraft<PlanningMaterial> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const selection = useRef({ value: 0 })
  const listRequest = useRef({ value: 0 })
  const [persistError, setPersistError] = useState<string | null>(null)
  const current = useRef({ port, scopeKey })
  current.current = { port, scopeKey }
  const isCurrent = useCallback(
    () => current.current.port === port && current.current.scopeKey === scopeKey,
    [port, scopeKey]
  )
  const controller = useMemo(
    () =>
      port
        ? new MaterialDraftController<PlanningMaterial>(
            {
              async read(version) {
                const snapshot = await port.read(version)
                return snapshot
                  ? { ...snapshot, document: PlanningMaterialSchema.parse(snapshot.document) }
                  : null
              },
              async save(input) {
                const snapshot = await port.save(input)
                return { ...snapshot, document: PlanningMaterialSchema.parse(snapshot.document) }
              }
            },
            (value) => {
              if (!isCurrent()) {
                return
              }
              setDraft(value)
              if (!value) {
                return
              }
              try {
                localStorage.setItem(
                  planningDraftKey(scopeKey, value.document.version),
                  JSON.stringify(value)
                )
                setPersistError(null)
              } catch {
                setPersistError('本机草稿恢复不可用，请保存后再离开。')
              }
            }
          )
        : null,
    [port, scopeKey, isCurrent]
  )

  const list = useCallback(async () => {
    if (!port) {
      return
    }
    const request = ++listRequest.current.value
    try {
      const items = await port.list()
      if (isCurrent() && request === listRequest.current.value) {
        setVersions(items)
      }
    } catch (reason) {
      if (isCurrent() && request === listRequest.current.value) {
        setError(reason instanceof Error ? reason.message : '无法列出版本')
      }
    }
  }, [port, isCurrent])

  useEffect(() => {
    selection.current.value++
    controller?.clear()
    setDraft(null)
    setVersions([])
    setError(null)
    setPersistError(null)
    setBusy(false)
    void list()
    const selections = selection.current
    const lists = listRequest.current
    return () => {
      selections.value++
      lists.value++
      controller?.clear()
    }
  }, [list, controller])

  const select = useCallback(
    async (version: string, create = false) => {
      if (!port || !controller) {
        return undefined
      }
      const token = ++selection.current.value
      controller.clear()
      setBusy(true)
      setError(null)
      try {
        validatePlanningVersion(version)
        const snapshot = await port.read(version)
        if (!isCurrent() || token !== selection.current.value) {
          return undefined
        }
        if (create && snapshot) {
          throw new Error('该版本已存在，请选择已有版本。')
        }
        let restored: MaterialDraft<PlanningMaterial> | null = null
        const raw = localStorage.getItem(planningDraftKey(scopeKey, version))
        if (raw) {
          const candidate = JSON.parse(raw)
          const document = PlanningMaterialSchema.parse(candidate.document)
          if (
            document.version === version &&
            typeof candidate.dirty === 'boolean' &&
            (candidate.expectedRevision === null ||
              /^sha256:[a-f0-9]{64}$/.test(candidate.expectedRevision))
          ) {
            restored = {
              document,
              dirty: candidate.dirty,
              expectedRevision: candidate.expectedRevision
            }
          } else {
            throw new Error('本机草稿格式无法读取，保留原草稿待核。')
          }
        }
        if (!create && !snapshot && !restored?.dirty) {
          throw new Error('该版本材料不存在；未创建替代文件。')
        }
        const document: PlanningMaterial = snapshot
          ? PlanningMaterialSchema.parse(snapshot.document)
          : {
              schema_version: 3,
              version,
              cycleId: crypto.randomUUID(),
              summary: { progress: '', risks: '' },
              goals: [],
              tasks: []
            }
        controller.restore(
          restored?.dirty
            ? {
                ...restored,
                ...((snapshot?.revision ?? null) !== restored.expectedRevision
                  ? {
                      remote: snapshot ? { ...snapshot, document } : null,
                      error: '文件与待保存草稿不同，请核对。'
                    }
                  : {})
              }
            : { document, expectedRevision: snapshot?.revision ?? null, dirty: create }
        )
        return controller.value?.document
      } catch (reason) {
        if (isCurrent() && token === selection.current.value) {
          setError(reason instanceof Error ? reason.message : '无法读取版本')
        }
        return undefined
      } finally {
        if (isCurrent() && token === selection.current.value) {
          setBusy(false)
        }
      }
    },
    [port, controller, scopeKey, isCurrent]
  )

  const selectedVersion = draft?.document.version
  const clear = useCallback(() => {
    selection.current.value++
    controller?.clear()
    setBusy(false)
    setError(null)
  }, [controller])
  useEffect(() => {
    if (!controller || !selectedVersion) {
      return
    }
    const timer = setInterval(() => {
      const token = selection.current.value
      void controller.refresh().catch((reason) => {
        if (isCurrent() && token === selection.current.value) {
          setError(String(reason))
        }
      })
    }, 5000)
    return () => clearInterval(timer)
  }, [controller, selectedVersion, isCurrent])

  return {
    versions,
    draft,
    error: error ?? persistError,
    busy,
    select,
    clear,
    list,
    edit: (document: PlanningMaterial) => controller?.edit(document),
    refresh: () => controller?.refresh(),
    save: async () => {
      if (!controller) {
        return false
      }
      const token = selection.current.value
      setBusy(true)
      try {
        const saved = await controller.save()
        if (saved && isCurrent() && token === selection.current.value) {
          await list()
        }
        return saved
      } finally {
        if (isCurrent() && token === selection.current.value) {
          setBusy(false)
        }
      }
    },
    useRemote: () => {
      if (draft?.remote) {
        controller?.useRemote(draft.remote)
      }
    },
    /** Escape hatch for a stale dirty draft over a confirmed archive: re-read host truth. */
    discardLocal: async () => {
      if (!port || !controller?.value) {
        return
      }
      const version = controller.value.document.version
      setBusy(true)
      try {
        const snapshot = await port.read(version)
        if (!isCurrent()) {
          return
        }
        if (snapshot) {
          controller.restore({
            document: PlanningMaterialSchema.parse(snapshot.document),
            expectedRevision: snapshot.revision,
            dirty: false
          })
        } else {
          controller.clear()
          try {
            localStorage.removeItem(planningDraftKey(scopeKey, version))
          } catch {
            /* The recovery flow keeps the original text on failure. */
          }
        }
      } catch (reason) {
        if (isCurrent()) {
          setError(reason instanceof Error ? reason.message : '无法重读材料')
        }
      } finally {
        if (isCurrent()) {
          setBusy(false)
        }
      }
    },
    useMerged: (document: PlanningMaterial) => {
      if (draft?.remote) {
        controller?.useMerged(document, draft.remote.revision)
      }
    }
  }
}
