import { useEffect, useMemo, useRef, useState } from 'react'
import type { VersionDocumentPort } from '../../../../shared/workbench/version-document'
import {
  AcceptanceMaterialSchema,
  type AcceptanceMaterial
} from '../../../../shared/workbench/version-material'
import { MaterialDraftController, type MaterialDraft } from '../version-cycle/material-draft'

/** Version-scoped UI recovery is disposable; authoritative writes use the host CAS transaction. */
export function useAcceptanceDraft(
  key: string,
  port: VersionDocumentPort<AcceptanceMaterial>,
  selectedVersion?: string,
  materialRefresh = 0
) {
  const [initializationSuppressed, setInitializationSuppressed] = useState(false)
  const [loadedRefresh, setLoadedRefresh] = useState(-1)
  const [loadedVersion, setLoadedVersion] = useState<string | null>(null)
  const [draft, setDraft] = useState<MaterialDraft<AcceptanceMaterial> | null>(null)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  const [recoveryText, setRecoveryText] = useState<string | null>(null)
  const recovery = useRef({ present: false, writable: true, request: 0 }).current
  const controller = useMemo(() => new MaterialDraftController(port, setDraft), [port])
  useEffect(() => {
    if (!materialRefresh) {
      return
    }
    let current = true
    void controller.refresh().catch((reason) => {
      if (current) {
        setRecoveryError(String(reason))
      }
    })
    return () => {
      current = false
    }
  }, [controller, materialRefresh])
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(key)
      if (!saved) {
        return
      }
      recovery.present = true
      setRecoveryText(saved)
      const value = JSON.parse(saved) as MaterialDraft<AcceptanceMaterial>
      const document = AcceptanceMaterialSchema.parse(value.document)
      if (document.version !== selectedVersion) {
        throw new Error('草稿不属于当前版本')
      }
      if (
        value.expectedRevision !== null &&
        !/^sha256:[a-f0-9]{64}$/.test(value.expectedRevision)
      ) {
        throw new Error('草稿修订无效')
      }
      controller.restore({
        document,
        expectedRevision: value.expectedRevision,
        dirty: value.dirty === true
      })
      setRecoveryText(null)
    } catch {
      try {
        const original = sessionStorage.getItem(key)
        if (original) {
          sessionStorage.setItem(`${key}:unreadable`, original)
        }
      } catch {
        recovery.writable = false
      }
      setRecoveryError('本机恢复草稿无法读取，原件保留。可从宿主读取材料，或先复制恢复内容。')
    }
  }, [controller, key, recovery, selectedVersion])
  useEffect(() => {
    if (!selectedVersion) {
      return
    }
    if (controller.value || recovery.present) {
      setLoadedVersion(selectedVersion)
      setLoadedRefresh(materialRefresh)
      return
    }
    let current = true
    const request = ++recovery.request
    void port
      .read(selectedVersion)
      .then((saved) => {
        if (current && request === recovery.request) {
          setLoadedVersion(selectedVersion)
          setLoadedRefresh(materialRefresh)
        }
        if (current && request === recovery.request && !controller.value && saved) {
          controller.restore({
            document: saved.document,
            expectedRevision: saved.revision,
            dirty: false
          })
        }
      })
      .catch((reason) => {
        if (current && request === recovery.request) {
          setRecoveryError(String(reason))
        }
      })
    return () => {
      current = false
    }
  }, [controller, port, selectedVersion, recovery, materialRefresh])
  useEffect(() => {
    if (!draft || !recovery.writable || draft.document.version !== selectedVersion) {
      return
    }
    try {
      sessionStorage.setItem(key, JSON.stringify(draft))
      setRecoveryError(null)
    } catch {
      setRecoveryError('本机草稿恢复不可用，请保持页面打开并保存到宿主。')
    }
  }, [draft, key, recovery, selectedVersion])
  return {
    draft,
    loadedVersion,
    loadedRefresh,
    initializationSuppressed,
    controller,
    recoveryError,
    recoveryText,
    async refresh() {
      if (controller.value) {
        return controller.refresh()
      }
      if (!selectedVersion) {
        return
      }
      const request = ++recovery.request
      const saved = await port.read(selectedVersion)
      if (request !== recovery.request || controller.value) {
        return
      }
      setRecoveryError(null)
      setLoadedVersion(selectedVersion)
      setLoadedRefresh(materialRefresh)
      if (saved) {
        controller.restore({
          document: saved.document,
          expectedRevision: saved.revision,
          dirty: false
        })
      }
    },
    cancelAutomaticRead() {
      recovery.request++
    },
    clear() {
      recovery.request++
      setInitializationSuppressed(true)
      controller.clear()
      recovery.present = false
      setRecoveryText(null)
      setRecoveryError(null)
      try {
        sessionStorage.removeItem(key)
      } catch {
        setRecoveryError('本机恢复内容无法清除，请保持页面打开并保存到宿主。')
      }
    }
  }
}
