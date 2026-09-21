import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import {
  resolveWeekPlanHomeWorktreeId,
  weekPlanProjectKey,
  weekPlanProjectWorktreeIds
} from './plan-week-plan-identity'
import { readWeekPlanSessionAnchor } from './plan-week-plan-anchor'
import {
  clearStaleConfirmation,
  confirmPlanningStage,
  emptyPlanningDocument,
  parsePlanningDocument,
  pickPlanningVersion,
  serializePlanningDocument,
  touchPlanningDocument,
  type PlanningDocument
} from './plan-week-document'
import { ensurePlanningFile, listPlanningVersions, planningFilePath } from './plan-week-fs'

const SAVE_WAIT_MS = 800
const DISK_POLL_MS = 1500

type DocState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; data: PlanningDocument; filePath: string }
  | { kind: 'failed'; error: string }

export function usePlanWeekDocument(): {
  workspacePath: string | null
  versions: string[]
  state: DocState
  saveStatus: string
  saveError: boolean
  patch: (updater: (data: PlanningDocument) => PlanningDocument) => void
  confirm: (stage: 'results' | 'plan') => Promise<boolean>
  selectVersion: (version: string) => void
  reload: () => void
} {
  const { workspacePath, projectKey } = useAppStore(
    useShallow((store) => {
      const activeWorktreeId = store.activeWorktreeId
      if (!activeWorktreeId) {
        return { workspacePath: null, projectKey: null }
      }
      const worktrees = store.allWorktrees?.() ?? []
      const projectWorktreeIds = weekPlanProjectWorktreeIds(activeWorktreeId, worktrees)
      const projectKey = weekPlanProjectKey(
        store.getKnownWorktreeById(activeWorktreeId),
        activeWorktreeId
      )
      const anchor = readWeekPlanSessionAnchor(projectKey)
      const homeWorktreeId = resolveWeekPlanHomeWorktreeId({
        activeWorktreeId,
        projectWorktreeIds,
        worktrees,
        storedWorktreeId: anchor?.worktreeId
      })
      return {
        workspacePath: store.getKnownWorktreeById(homeWorktreeId)?.path ?? null,
        projectKey
      }
    })
  )
  const [state, setState] = useState<DocState>({ kind: 'idle' })
  const [versions, setVersions] = useState<string[]>([])
  const [saveStatus, setSaveStatus] = useState('')
  const [saveError, setSaveError] = useState(false)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const dataRef = useRef<PlanningDocument | null>(null)
  const fileRef = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const diskMtimeRef = useRef(0)
  const savingRef = useRef(false)

  const persist = useCallback(async (filePath: string, data: PlanningDocument) => {
    savingRef.current = true
    try {
      await window.api.fs.writeFile({
        filePath,
        content: serializePlanningDocument(data)
      })
      const stat = await window.api.fs.stat({ filePath })
      diskMtimeRef.current = stat.mtime
      setSaveError(false)
      setSaveStatus('')
      return true
    } catch (error) {
      setSaveError(true)
      setSaveStatus(error instanceof Error && error.message.trim() ? error.message : '保存失败')
      return false
    } finally {
      savingRef.current = false
    }
  }, [])

  const scheduleSave = useCallback(
    (filePath: string, data: PlanningDocument) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        void persist(filePath, data)
      }, SAVE_WAIT_MS)
    },
    [persist]
  )

  const load = useCallback(async (path: string, key: string, preferred?: string, quiet = false) => {
    if (!quiet) {
      setState({ kind: 'loading' })
    }
    setLoadedKey(key)
    try {
      const listed = await listPlanningVersions(path)
      const version =
        preferred && listed.some((stamp) => stamp.version === preferred)
          ? preferred
          : pickPlanningVersion(listed)
      const filePath = planningFilePath(path, version)
      const exists = await window.api.fs.pathExists({ filePath })
      if (!exists && quiet) {
        return
      }
      const data = exists
        ? parsePlanningDocument((await window.api.fs.readFile({ filePath })).content, version)
        : emptyPlanningDocument(version)
      if (!exists) {
        await ensurePlanningFile(filePath)
        await window.api.fs.writeFile({
          filePath,
          content: serializePlanningDocument(data)
        })
      }
      const stat = await window.api.fs.stat({ filePath })
      diskMtimeRef.current = stat.mtime
      dataRef.current = data
      fileRef.current = filePath
      const names = listed.map((stamp) => stamp.version)
      setVersions(names.includes(version) ? names : [...names, version])
      setState({ kind: 'ready', data, filePath })
      setSaveStatus('')
      setSaveError(false)
    } catch (error) {
      if (quiet && dataRef.current && fileRef.current) {
        setSaveError(true)
        setSaveStatus(
          error instanceof Error && error.message.trim() ? error.message : '无法同步版本计划'
        )
        return
      }
      setState({
        kind: 'failed',
        error: error instanceof Error && error.message.trim() ? error.message : '无法打开版本计划'
      })
    }
  }, [])

  useEffect(() => {
    if (!workspacePath || !projectKey) {
      setState({ kind: 'idle' })
      setLoadedKey(null)
      dataRef.current = null
      fileRef.current = null
      return
    }
    if (loadedKey === projectKey && state.kind !== 'idle') {
      return
    }
    void load(workspacePath, projectKey)
  }, [load, loadedKey, projectKey, state.kind, workspacePath])

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    },
    []
  )

  useEffect(() => {
    if (state.kind !== 'ready' || !workspacePath || !projectKey) {
      return
    }
    const timer = window.setInterval(() => {
      if (timerRef.current || savingRef.current || !fileRef.current || !dataRef.current) {
        return
      }
      void (async () => {
        try {
          const filePath = fileRef.current
          if (!filePath) {
            return
          }
          const stat = await window.api.fs.stat({ filePath })
          if (stat.mtime <= diskMtimeRef.current) {
            return
          }
          await load(workspacePath, projectKey, dataRef.current?.version, true)
        } catch {
          // Keep the on-screen draft; the next tick retries.
        }
      })()
    }, DISK_POLL_MS)
    return () => window.clearInterval(timer)
  }, [load, projectKey, state.kind, workspacePath])

  const patch = useCallback(
    (updater: (data: PlanningDocument) => PlanningDocument) => {
      const current = dataRef.current
      const filePath = fileRef.current
      if (!current || !filePath) {
        return
      }
      const next = touchPlanningDocument(clearStaleConfirmation(current, updater(current)))
      dataRef.current = next
      fileRef.current = filePath
      setState({ kind: 'ready', data: next, filePath })
      scheduleSave(filePath, next)
    },
    [scheduleSave]
  )

  const confirm = useCallback(
    async (stage: 'results' | 'plan') => {
      const current = dataRef.current
      const filePath = fileRef.current
      if (!current || !filePath) {
        return false
      }
      try {
        const next = confirmPlanningStage(current, stage)
        dataRef.current = next
        setState({ kind: 'ready', data: next, filePath })
        return persist(filePath, next)
      } catch (error) {
        setSaveError(true)
        setSaveStatus(error instanceof Error ? error.message : '无法确认')
        return false
      }
    },
    [persist]
  )

  const selectVersion = useCallback(
    (version: string) => {
      if (!workspacePath || !projectKey) {
        return
      }
      void load(workspacePath, projectKey, version)
    },
    [load, projectKey, workspacePath]
  )

  const reload = useCallback(() => {
    if (workspacePath && projectKey) {
      void load(workspacePath, projectKey, dataRef.current?.version)
    }
  }, [load, projectKey, workspacePath])

  return {
    workspacePath,
    versions,
    state,
    saveStatus,
    saveError,
    patch,
    confirm,
    selectVersion,
    reload
  }
}
