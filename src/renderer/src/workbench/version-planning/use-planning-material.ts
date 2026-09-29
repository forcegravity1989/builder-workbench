import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  PlanningMaterialSchema,
  type PlanningMaterial
} from '../../../../shared/workbench/version-material'
import { validatePlanningVersion } from '../../../../shared/workbench/version-document'
import type { VersionMaterialCandidate } from '../../../../shared/workbench/version-material-request'
import type { nativeVersionMaterialPort } from '../version-material-port'
import { MaterialDraftController, type MaterialDraft } from '../version-cycle/material-draft'
import { usePlanningAutosave, type PlanningAutosaveOptions } from './use-planning-autosave'

export function planningDraftKey(scopeKey: string, version: string) {
  return `workbench.plan.draft:${scopeKey}:${encodeURIComponent(version)}`
}

export function usePlanningMaterial(
  port: ReturnType<typeof nativeVersionMaterialPort> | null,
  scopeKey: string,
  autosave?: PlanningAutosaveOptions
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
        setVersions((previous) =>
          JSON.stringify(previous) === JSON.stringify(items) ? previous : items
        )
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
    const timer = setInterval(() => void list(), 5000)
    const selections = selection.current
    const lists = listRequest.current
    return () => {
      clearInterval(timer)
      selections.value++
      lists.value++
      controller?.clear()
    }
  }, [list, controller])

  const select = useCallback(
    async (version: string) => {
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
        if (!snapshot && !restored?.dirty) {
          throw new Error('该版本材料不存在；未创建替代文件。')
        }
        const document = snapshot
          ? PlanningMaterialSchema.parse(snapshot.document)
          : restored?.document
        if (!document) {
          throw new Error('该版本材料不存在；未创建替代文件。')
        }
        controller.restore(
          restored?.dirty
            ? {
                ...restored,
                ...(!snapshot || snapshot.revision !== restored.expectedRevision
                  ? {
                      remote: snapshot ? { ...snapshot, document } : null,
                      error: '文件与待保存草稿不同，请核对。'
                    }
                  : {})
              }
            : { document, expectedRevision: snapshot?.revision ?? null, dirty: false }
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

  const saving = usePlanningAutosave({
    controller,
    draft,
    options: autosave,
    isCurrent,
    selection,
    onSaved: list
  })

  return {
    versions,
    draft,
    error: error ?? persistError,
    busy: busy || saving.saving,
    select,
    clear,
    list,
    edit: (document: PlanningMaterial) => controller?.edit(document),
    refresh: () => controller?.refresh(),
    save: saving.save,
    flush: saving.flush,
    useRemote: () => {
      if (draft?.remote) {
        controller?.useRemote(draft.remote)
      }
    },
    /** Explicitly discard a stale draft only after host read and cache removal both succeed. */
    discardLocal: async () => {
      if (!port || !controller?.value) {
        return
      }
      const original = controller.value
      const version = original.document.version
      const token = selection.current.value
      setBusy(true)
      setError(null)
      try {
        const snapshot = await port.read(version)
        if (!isCurrent() || token !== selection.current.value) {
          return
        }
        if (controller.value !== original) {
          throw new Error('读取期间内容已变化，本地输入已保留，请核对后重试。')
        }
        const document = snapshot ? PlanningMaterialSchema.parse(snapshot.document) : null
        try {
          localStorage.removeItem(planningDraftKey(scopeKey, version))
        } catch {
          throw new Error('无法清理本机草稿，输入已保留，请重试。')
        }
        setPersistError(null)
        if (snapshot && document) {
          controller.restore({
            document,
            expectedRevision: snapshot.revision,
            dirty: false
          })
        } else {
          controller.clear()
        }
      } catch (reason) {
        if (isCurrent() && token === selection.current.value) {
          setError(reason instanceof Error ? reason.message : '无法重读材料')
        }
      } finally {
        if (isCurrent() && token === selection.current.value) {
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
